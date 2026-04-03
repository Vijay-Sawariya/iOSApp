from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Form, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict
from datetime import datetime, timedelta, date
from passlib.context import CryptContext
import jwt
import pymysql
from pymysql.cursors import DictCursor
from contextlib import contextmanager
import re
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MySQL connection config
MYSQL_CONFIG = {
    'host': os.environ.get('MYSQL_HOST'),
    'port': int(os.environ.get('MYSQL_PORT', 3306)),
    'user': os.environ.get('MYSQL_USER'),
    'password': os.environ.get('MYSQL_PASSWORD'),
    'database': os.environ.get('MYSQL_DATABASE'),
    'charset': 'utf8mb4',
    'cursorclass': DictCursor
}

# Security
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Root health check endpoint for Kubernetes
@app.get("/")
def root_health():
    return {"status": "healthy", "service": "Sagar Home LMS API"}

# API health check endpoint
@api_router.get("/health")
def api_health():
    """Health check endpoint for monitoring"""
    try:
        # Test database connection
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

# ============= Database Helper =============
@contextmanager
def get_db():
    connection = pymysql.connect(**MYSQL_CONFIG)
    try:
        yield connection
    finally:
        connection.close()

# ============= Helper Functions =============
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ============= Calculation Helper Functions =============
def normalize_floor_label(label: str) -> str:
    """Normalize floor labels for consistent matching"""
    mapping = {
        'T': 'TF', 'F+TT': 'TF+TT', 'TF+TT': 'TF+TT',
        'BASEMENT': 'BMT', 'BAS': 'BMT', 'B': 'BMT'
    }
    upper = label.strip().upper()
    return mapping.get(upper, upper)

def floor_share_percent(label: str) -> Optional[float]:
    """Get floor share percentage for circle value calculation"""
    n = normalize_floor_label(label)
    # Remove any spaces around + sign for consistent matching
    n = n.replace(' + ', '+').replace('+ ', '+').replace(' +', '+')
    
    if n == 'BMT+GF':
        return 32.5
    twenty_two = ['FF', 'SF', 'T', 'TF', 'F+TT', 'TF+TT', 'TF+TERR']
    if n in twenty_two:
        return 22.5
    return None

def norms_from_bucket(plot_sqm: float) -> dict:
    """Get FAR and Coverage norms based on plot size in sq meters"""
    # [min, max, FAR, coverage%]
    rows = [
        (0, 32, 350, 90),
        (32, 50, 350, 90),
        (50, 100, 350, 90),
        (100, 250, 300, 75),
        (250, 750, 225, 75),
        (750, 1000, 250, 50),
        (1000, 1500, 200, 50),
        (1500, 2250, 250, 50),
        (2250, 3000, 200, 50),
        (3000, 3750, 200, 50),
        (3750, float('inf'), 200, 50),
    ]
    for min_val, max_val, far, cov in rows:
        if plot_sqm < 32 and max_val == 32:
            return {'far': far, 'cov': cov}
        if min_val <= plot_sqm <= max_val:
            return {'far': far, 'cov': cov}
    return {'far': 200, 'cov': 50}

def to_sq_meter(value: float, unit: str) -> float:
    """Convert area to square meters"""
    if unit == 'sqm':
        return value
    elif unit == 'sq_yd':
        return value * 0.83612736
    elif unit == 'sq_ft':
        return value / 10.764
    return value

def calculate_circle_values(location: str, area_size: float, floors_str: str, conn) -> List[Dict]:
    """Calculate circle value for each floor"""
    circle_values = []
    
    # Get circle rate from location table (column name has space: "Circle Rate")
    cursor = conn.cursor()
    cursor.execute("SELECT `Circle Rate` as circle_rate FROM locations WHERE LOWER(name) = LOWER(%s)", (location,))
    result = cursor.fetchone()
    
    if not result or not result['circle_rate']:
        return []
    
    circle_rate_per_sqm = float(result['circle_rate'])
    
    # Constants
    construction_cost_per_100_sqyd = 10000000.0  # 1 Crore per 100 sq yd
    sqyd_to_sqm = 0.83612736
    construction_cost_per_sqyd = construction_cost_per_100_sqyd / 100.0
    construction_cost_per_sqm = construction_cost_per_sqyd / sqyd_to_sqm
    
    # Convert area to sq meters (assuming sq_yd as default)
    area_sqm = to_sq_meter(area_size, 'sq_yd')
    
    # Parse floors
    if not floors_str:
        return []
    
    floors = [f.strip() for f in floors_str.split(',') if f.strip()]
    
    for floor in floors:
        share = floor_share_percent(floor)
        if share is not None:
            value = (circle_rate_per_sqm + construction_cost_per_sqm) * area_sqm * (share / 100.0)
            circle_values.append({
                'label': floor,
                'percent': share,
                'value': round(value / 10000000, 2),  # Convert to Crores
            })
    
    return circle_values

def calculate_plot_specifications(area_size: float, floors_count: int, unit: str = 'sq_yd') -> Dict:
    """Calculate plot size specifications"""
    # Convert to sq ft
    if unit == 'sqm':
        plot_sqft = area_size * 10.764
        plot_sqm = area_size
    elif unit == 'sq_yd':
        plot_sqft = area_size * 9
        plot_sqm = area_size * 0.83612736
    else:  # sq_ft
        plot_sqft = area_size
        plot_sqm = area_size / 10.764
    
    # Get FAR and Coverage norms
    norms = norms_from_bucket(plot_sqm)
    far = norms['far']
    cov = norms['cov']
    
    # Calculate total built-up (FAR-based)
    if unit == 'sqm':
        total_builtup_sqft = plot_sqft * far / 100
    else:  # sq_yd or sq_ft
        total_builtup_sqft = plot_sqft * far / 100
    
    # Calculate per-floor built-up
    if floors_count > 0:
        ideal_per_floor = total_builtup_sqft / floors_count
        ground_coverage_sqft = plot_sqft * (cov / 100)
        per_floor_builtup = min(ideal_per_floor, ground_coverage_sqft) + 200
    else:
        per_floor_builtup = 0
    
    return {
        'total_builtup': round(total_builtup_sqft, 2),
        'per_floor_builtup': round(per_floor_builtup, 2),
        'far': far,
        'coverage': cov,
    }

def parse_floor_pricing_from_notes(notes: str) -> Dict[str, float]:
    """Parse floor pricing from notes field"""
    floor_pricing = {}
    if not notes:
        return floor_pricing
    
    # Look for "Floor Pricing: BMT+GF: ₹50000000, FF: ₹55000000"
    match = re.search(r'Floor Pricing:\s*(.+?)(?:\n|$)', notes)
    if match:
        pricing_str = match.group(1)
        # Parse each floor pricing
        for item in pricing_str.split(','):
            item = item.strip()
            if ':' in item:
                parts = item.split(':')
                if len(parts) >= 2:
                    floor = parts[0].strip()
                    price_str = parts[1].strip().replace('₹', '').replace(',', '')
                    try:
                        price = float(price_str)
                        floor_pricing[floor] = price / 10000000  # Convert to Crores
                    except ValueError:
                        continue
    
    return floor_pricing

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        logging.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

# ============= Models =============
class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    email: EmailStr
    role: str = "user"

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: str
    role: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LeadResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    lead_type: Optional[str] = None
    location: Optional[str] = None
    bhk: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    property_type: Optional[str] = None
    lead_temperature: Optional[str] = None
    lead_status: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    builder_id: Optional[int] = None

class LeadCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    lead_type: Optional[str] = "buyer"
    location: Optional[str] = None
    address: Optional[str] = None
    bhk: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    property_type: Optional[str] = None
    lead_temperature: Optional[str] = "Hot"
    lead_status: Optional[str] = "New"
    notes: Optional[str] = None
    builder_id: Optional[int] = None
    floor: Optional[str] = None
    area_size: Optional[str] = None
    car_parking_number: Optional[int] = None
    lift_available: Optional[str] = None
    unit: Optional[str] = None
    Property_locationUrl: Optional[str] = None
    building_facing: Optional[str] = None
    possession_on: Optional[str] = None
    # Amenities as comma-separated string
    required_amenities: Optional[str] = None
    # Legacy individual amenity fields (kept for backward compatibility)
    park_facing: Optional[int] = 0
    park_at_rear: Optional[int] = 0
    wide_road: Optional[int] = 0
    peaceful_location: Optional[int] = 0
    main_road: Optional[int] = 0
    corner: Optional[int] = 0
    # Floor pricing (list of dicts)
    floor_pricing: Optional[List[dict]] = None

class BuilderResponse(BaseModel):
    id: int
    builder_name: str
    company_name: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    created_at: Optional[datetime]

class BuilderCreate(BaseModel):
    builder_name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class ReminderResponse(BaseModel):
    id: int
    lead_id: Optional[int]
    title: str
    due_date: str  # Date in YYYY-MM-DD format
    due_time: Optional[str]  # Time in HH:MM:SS format
    action_type: str
    description: Optional[str]
    status: str
    priority: Optional[str]
    outcome: Optional[str]
    is_notified: Optional[int]
    created_at: Optional[datetime]

class ReminderCreate(BaseModel):
    lead_id: Optional[int] = None
    title: str
    reminder_date: str  # ISO format datetime string (YYYY-MM-DDTHH:MM:SS)
    reminder_type: str  # Maps to action_type
    notes: Optional[str] = None  # Maps to description
    status: str = "Pending"
    priority: Optional[str] = "Medium"

class DashboardStats(BaseModel):
    total_leads: int
    client_leads: int  # buyer, tenant
    inventory_leads: int  # seller, landlord, builder
    hot_leads: int
    warm_leads: int
    cold_leads: int
    total_builders: int
    today_reminders: int
    pending_reminders: int

# ============= Auth Routes =============
@api_router.post("/auth/register", response_model=UserResponse)
def register(user_data: UserCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE username = %s", (user_data.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Create user
        hashed_password = get_password_hash(user_data.password)
        cursor.execute(
            "INSERT INTO users (username, password, full_name, email, role, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
            (user_data.username, hashed_password, user_data.full_name, user_data.email, user_data.role, datetime.utcnow())
        )
        conn.commit()
        user_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
    return UserResponse(**user)

@api_router.post("/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = %s", (credentials.username,))
        user = cursor.fetchone()
        
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if password is hashed (starts with $2b$ for bcrypt) or plain text
    password_valid = False
    if user['password'].startswith('$2b$') or user['password'].startswith('$2a$'):
        # Hashed password - use bcrypt verification
        password_valid = verify_password(credentials.password, user['password'])
    else:
        # Plain text password (legacy) - direct comparison
        password_valid = (credentials.password == user['password'])
    
    if not password_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": str(user['id'])})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(**user)
    )

@api_router.get("/auth/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)

# ============= Lead Routes =============
@api_router.get("/leads/clients")
def get_client_leads(
    skip: int = 0,
    limit: int = 1000,
    current_user: dict = Depends(get_current_user)
):
    """Get CLIENT leads (buyer, tenant) - excludes deleted"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT l.*, u.full_name as created_by_name 
               FROM leads l
               LEFT JOIN users u ON l.created_by = u.id
               WHERE l.lead_type IN ('buyer', 'tenant') 
               AND (l.is_deleted IS NULL OR l.is_deleted = 0)
               ORDER BY l.created_at DESC LIMIT %s OFFSET %s""",
            (limit, skip)
        )
        leads = cursor.fetchall()
    
    return leads

@api_router.get("/leads/inventory")
def get_inventory_leads(
    skip: int = 0,
    limit: int = 1000,
    current_user: dict = Depends(get_current_user)
):
    """Get INVENTORY leads (seller, landlord, builder) with floor pricing - excludes deleted"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT l.*, u.full_name as created_by_name 
               FROM leads l
               LEFT JOIN users u ON l.created_by = u.id
               WHERE l.lead_type IN ('seller', 'landlord', 'builder') 
               AND (l.is_deleted IS NULL OR l.is_deleted = 0)
               ORDER BY l.created_at DESC LIMIT %s OFFSET %s""",
            (limit, skip)
        )
        leads = cursor.fetchall()
        
        # Fetch floor pricing for all leads
        if leads:
            lead_ids = [lead['id'] for lead in leads]
            placeholders = ','.join(['%s'] * len(lead_ids))
            cursor.execute(
                f"SELECT * FROM inventory_floor_pricing WHERE lead_id IN ({placeholders}) ORDER BY lead_id, id",
                lead_ids
            )
            all_floor_pricing = cursor.fetchall()
            
            # Group floor pricing by lead_id
            floor_pricing_map = {}
            for fp in all_floor_pricing:
                lead_id = fp['lead_id']
                if lead_id not in floor_pricing_map:
                    floor_pricing_map[lead_id] = []
                floor_pricing_map[lead_id].append({
                    'floor_label': fp['floor_label'],
                    'floor_amount': float(fp['floor_amount']) if fp['floor_amount'] else 0
                })
            
            # Add floor pricing to each lead (calculations done only in detail view for performance)
            for lead in leads:
                lead['floor_pricing'] = floor_pricing_map.get(lead['id'], [])
    
    return leads

@api_router.get("/leads", response_model=List[LeadResponse])
def get_all_leads(
    skip: int = 0,
    limit: int = 1000,
    current_user: dict = Depends(get_current_user)
):
    """Get all leads - excludes deleted"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT * FROM leads 
               WHERE (is_deleted IS NULL OR is_deleted = 0)
               ORDER BY created_at DESC LIMIT %s OFFSET %s""",
            (limit, skip)
        )
        leads = cursor.fetchall()
    
    return [LeadResponse(**lead) for lead in leads]

@api_router.get("/leads/{lead_id}")
def get_lead(lead_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM leads WHERE id = %s", (lead_id,))
        lead = cursor.fetchone()
        
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Fetch floor pricing from database
        cursor.execute(
            "SELECT floor_label, floor_amount FROM inventory_floor_pricing WHERE lead_id = %s ORDER BY id",
            (lead_id,)
        )
        floor_pricing_rows = cursor.fetchall()
        
    # Build floor pricing list
    floor_pricing = []
    for row in floor_pricing_rows:
        floor_pricing.append({
            'floor_label': row['floor_label'],
            'floor_amount': float(row['floor_amount']) if row['floor_amount'] else 0
        })
    
    # Calculate circle values and plot specifications
    calculations = {}
    
    # Only calculate for inventory leads with required data
    if lead.get('lead_type') in ['seller', 'landlord', 'builder'] and lead.get('area_size') and lead.get('location'):
        try:
            # Get floors from the floor column directly
            floors_str = lead.get('floor', '')
            
            # Calculate circle values
            if floors_str:
                with get_db() as conn:
                    circle_values = calculate_circle_values(
                        lead['location'],
                        float(lead['area_size']),
                        floors_str,
                        conn
                    )
                    calculations['circle_values'] = circle_values
                
                # Calculate plot specifications
                floors_count = len([f.strip() for f in floors_str.split(',') if f.strip()])
                plot_specs = calculate_plot_specifications(
                    float(lead['area_size']),
                    floors_count,
                    'sq_yd'  # Default unit
                )
                calculations['plot_specifications'] = plot_specs
            
        except Exception as e:
            logging.error(f"Calculation error for lead {lead_id}: {e}")
            calculations['error'] = str(e)
    
    # Return lead with floor pricing and calculations
    response = dict(lead)
    response['floor_pricing'] = floor_pricing
    response['calculations'] = calculations
    
    # Fetch matched properties for client leads (buyer, tenant)
    if lead.get('lead_type') in ['buyer', 'tenant']:
        with get_db() as conn:
            cursor = conn.cursor()
            # Get matched properties from preferred_leads
            cursor.execute("""
                SELECT 
                    pl.id as match_id,
                    pl.reaction,
                    m.id as property_id,
                    m.name as property_name,
                    m.lead_type as property_type,
                    m.phone as property_phone,
                    m.floor as property_floor,
                    m.bhk as property_bhk,
                    m.area_size as property_size,
                    m.lead_status as property_status,
                    m.location as property_location,
                    m.address as property_address,
                    m.Property_locationUrl as property_map_url,
                    m.notes as property_notes,
                    m.unit as property_unit,
                    m.created_by as property_created_by,
                    u.full_name as created_by_fullname,
                    u.phone as created_by_phone
                FROM preferred_leads pl
                LEFT JOIN leads m ON pl.matching_lead_id = m.id
                LEFT JOIN users u ON m.created_by = u.id
                WHERE pl.lead_id = %s
                ORDER BY pl.created_at DESC
            """, (lead_id,))
            matched_properties = cursor.fetchall()
            
            # Fetch floor pricing for each matched property
            for prop in matched_properties:
                if prop.get('property_id'):
                    cursor.execute(
                        "SELECT floor_label, floor_amount FROM inventory_floor_pricing WHERE lead_id = %s ORDER BY id",
                        (prop['property_id'],)
                    )
                    prop_floor_pricing = cursor.fetchall()
                    prop['floor_pricing'] = [
                        {'floor_label': fp['floor_label'], 'floor_amount': float(fp['floor_amount']) if fp['floor_amount'] else 0}
                        for fp in prop_floor_pricing
                    ]
                else:
                    prop['floor_pricing'] = []
            
            response['matched_properties'] = matched_properties
    else:
        response['matched_properties'] = []
    
    return response

@api_router.post("/leads", response_model=LeadResponse)
def create_lead(lead: LeadCreate, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Build insert query with all available fields
        fields = ['name', 'phone', 'email', 'lead_type', 'location', 'address', 'bhk', 
                  'budget_min', 'budget_max', 'property_type', 'lead_temperature', 'lead_status', 
                  'notes', 'floor', 'area_size', 'car_parking_number', 'lift_available', 'unit',
                  'Property_locationUrl', 'building_facing', 'possession_on', 'builder_id',
                  'park_facing', 'park_at_rear', 'wide_road', 'peaceful_location', 'main_road', 'corner',
                  'required_amenities', 'created_at', 'created_by']
        
        values_dict = {
            'name': lead.name,
            'phone': lead.phone,
            'email': lead.email,
            'lead_type': lead.lead_type,
            'location': lead.location,
            'address': getattr(lead, 'address', None),
            'bhk': lead.bhk,
            'budget_min': lead.budget_min,
            'budget_max': lead.budget_max,
            'property_type': lead.property_type,
            'lead_temperature': lead.lead_temperature,
            'lead_status': lead.lead_status,
            'notes': lead.notes,
            'floor': getattr(lead, 'floor', None),
            'area_size': getattr(lead, 'area_size', None),
            'car_parking_number': getattr(lead, 'car_parking_number', None),
            'lift_available': getattr(lead, 'lift_available', None),
            'unit': getattr(lead, 'unit', None),
            'Property_locationUrl': getattr(lead, 'Property_locationUrl', None),
            'building_facing': getattr(lead, 'building_facing', None),
            'possession_on': getattr(lead, 'possession_on', None),
            'builder_id': getattr(lead, 'builder_id', None),
            'park_facing': getattr(lead, 'park_facing', 0),
            'park_at_rear': getattr(lead, 'park_at_rear', 0),
            'wide_road': getattr(lead, 'wide_road', 0),
            'peaceful_location': getattr(lead, 'peaceful_location', 0),
            'main_road': getattr(lead, 'main_road', 0),
            'corner': getattr(lead, 'corner', 0),
            'required_amenities': getattr(lead, 'required_amenities', None),
            'created_at': datetime.utcnow(),
            'created_by': current_user['id']
        }
        
        # Filter out None values for optional fields (except required ones)
        insert_fields = []
        insert_values = []
        for field in fields:
            if values_dict[field] is not None or field in ['name', 'created_at', 'created_by']:
                insert_fields.append(field)
                insert_values.append(values_dict[field])
        
        placeholders = ', '.join(['%s'] * len(insert_fields))
        query = f"INSERT INTO leads ({', '.join(insert_fields)}) VALUES ({placeholders})"
        
        cursor.execute(query, insert_values)
        conn.commit()
        lead_id = cursor.lastrowid
        
        # Handle floor pricing if provided
        floor_pricing = getattr(lead, 'floor_pricing', None)
        if floor_pricing:
            for fp in floor_pricing:
                if fp.get('floor') and fp.get('price'):
                    cursor.execute(
                        """INSERT INTO inventory_floor_pricing (lead_id, floor_label, floor_amount)
                           VALUES (%s, %s, %s)""",
                        (lead_id, fp['floor'], float(fp['price']))
                    )
            conn.commit()
        
        cursor.execute("SELECT * FROM leads WHERE id = %s", (lead_id,))
        created = cursor.fetchone()
    
    return LeadResponse(**created)

@api_router.put("/leads/{lead_id}")
def update_lead(lead_id: int, lead_data: dict, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Build dynamic update query based on provided fields
        update_fields = []
        values = []
        
        allowed_fields = [
            'name', 'phone', 'email', 'lead_type', 'location', 'address',
            'bhk', 'budget_min', 'budget_max', 'property_type',
            'lead_temperature', 'lead_status', 'notes', 'floor', 'area_size',
            'car_parking_number', 'lift_available', 'unit', 'Property_locationUrl',
            'building_facing', 'possession_on', 'builder_id',
            'park_facing', 'park_at_rear', 'wide_road', 'peaceful_location', 'main_road', 'corner',
            'required_amenities'
        ]
        
        for field in allowed_fields:
            if field in lead_data:
                update_fields.append(f"{field} = %s")
                values.append(lead_data[field])
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        values.append(lead_id)
        query = f"UPDATE leads SET {', '.join(update_fields)} WHERE id = %s"
        
        cursor.execute(query, values)
        conn.commit()
        
        # Handle floor pricing if provided
        if 'floor_pricing' in lead_data and lead_data['floor_pricing']:
            # Delete existing floor pricing
            cursor.execute("DELETE FROM inventory_floor_pricing WHERE lead_id = %s", (lead_id,))
            
            # Insert new floor pricing
            for fp in lead_data['floor_pricing']:
                if fp.get('floor') and fp.get('price'):
                    cursor.execute(
                        """INSERT INTO inventory_floor_pricing (lead_id, floor_label, floor_amount)
                           VALUES (%s, %s, %s)""",
                        (lead_id, fp['floor'], float(fp['price']))
                    )
            conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        cursor.execute("SELECT * FROM leads WHERE id = %s", (lead_id,))
        updated = cursor.fetchone()
    
    return updated

@api_router.delete("/leads/{lead_id}")
def delete_lead(lead_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Delete related floor pricing first
        cursor.execute("DELETE FROM inventory_floor_pricing WHERE lead_id = %s", (lead_id,))
        
        # Delete the lead
        cursor.execute("DELETE FROM leads WHERE id = %s", (lead_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lead not found")
    
    return {"message": "Lead deleted successfully"}

# ============= Builder Routes =============
@api_router.get("/builders", response_model=List[BuilderResponse])
def get_builders(
    skip: int = 0,
    limit: int = 500,
    current_user: dict = Depends(get_current_user)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM builders ORDER BY builder_name ASC LIMIT %s OFFSET %s",
            (limit, skip)
        )
        builders = cursor.fetchall()
    
    return [BuilderResponse(**builder) for builder in builders]

@api_router.get("/builders/{builder_id}", response_model=BuilderResponse)
def get_builder(builder_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM builders WHERE id = %s", (builder_id,))
        builder = cursor.fetchone()
        
    if not builder:
        raise HTTPException(status_code=404, detail="Builder not found")
    
    return BuilderResponse(**builder)

@api_router.get("/builders/{builder_id}/leads")
def get_builder_leads(builder_id: int, current_user: dict = Depends(get_current_user)):
    """Get all leads associated with a builder"""
    with get_db() as conn:
        cursor = conn.cursor()
        # Get leads where builder_id matches or lead_type is 'builder' and name matches builder
        cursor.execute("""
            SELECT l.*, u.full_name as created_by_name 
            FROM leads l
            LEFT JOIN users u ON l.created_by = u.id
            WHERE l.builder_id = %s 
            AND (l.is_deleted IS NULL OR l.is_deleted = 0)
            ORDER BY l.created_at DESC
        """, (builder_id,))
        leads = cursor.fetchall()
        
        # Fetch floor pricing for leads
        if leads:
            lead_ids = [lead['id'] for lead in leads]
            placeholders = ','.join(['%s'] * len(lead_ids))
            cursor.execute(
                f"SELECT * FROM inventory_floor_pricing WHERE lead_id IN ({placeholders}) ORDER BY lead_id, id",
                lead_ids
            )
            all_floor_pricing = cursor.fetchall()
            
            floor_pricing_map = {}
            for fp in all_floor_pricing:
                lead_id = fp['lead_id']
                if lead_id not in floor_pricing_map:
                    floor_pricing_map[lead_id] = []
                floor_pricing_map[lead_id].append({
                    'floor_label': fp['floor_label'],
                    'floor_amount': float(fp['floor_amount']) if fp['floor_amount'] else 0
                })
            
            for lead in leads:
                lead['floor_pricing'] = floor_pricing_map.get(lead['id'], [])
    
    return leads

@api_router.post("/builders", response_model=BuilderResponse)
def create_builder(builder: BuilderCreate, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO builders (builder_name, company_name, phone, address, created_at)
               VALUES (%s, %s, %s, %s, %s)""",
            (builder.builder_name, builder.company_name, builder.phone, builder.address, datetime.utcnow())
        )
        conn.commit()
        builder_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM builders WHERE id = %s", (builder_id,))
        created = cursor.fetchone()
    
    return BuilderResponse(**created)

@api_router.put("/builders/{builder_id}", response_model=BuilderResponse)
def update_builder(builder_id: int, builder: BuilderCreate, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE builders SET builder_name=%s, company_name=%s, phone=%s, address=%s
               WHERE id=%s""",
            (builder.builder_name, builder.company_name, builder.phone, builder.address, builder_id)
        )
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Builder not found")
        
        cursor.execute("SELECT * FROM builders WHERE id = %s", (builder_id,))
        updated = cursor.fetchone()
    
    return BuilderResponse(**updated)

@api_router.delete("/builders/{builder_id}")
def delete_builder(builder_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM builders WHERE id = %s", (builder_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Builder not found")
    
    return {"message": "Builder deleted successfully"}

# ============= Followup/Conversation Routes =============
class FollowupCreate(BaseModel):
    lead_id: int
    channel: str  # Call, WhatsApp, SMS, Email, Visit
    outcome: str  # Connected, No Answer, Call Back, Left VM, etc.
    notes: Optional[str] = None
    followup_date: Optional[str] = None  # Date of this conversation
    next_followup: Optional[str] = None  # Next followup datetime

class FollowupResponse(BaseModel):
    id: int
    lead_id: Optional[int]
    owner_id: Optional[int]
    channel: Optional[str]
    outcome: Optional[str]
    notes: Optional[str]
    followup_date: Optional[date]
    next_followup: Optional[datetime]
    created_at: datetime
    owner_name: Optional[str] = None
    
    class Config:
        from_attributes = True

@api_router.get("/leads/{lead_id}/followups")
def get_lead_followups(lead_id: int, current_user: dict = Depends(get_current_user)):
    """Get all followups/conversations for a lead"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT f.*, u.full_name as owner_name 
            FROM followups f
            LEFT JOIN users u ON f.owner_id = u.id
            WHERE f.lead_id = %s AND (f.is_deleted IS NULL OR f.is_deleted = 0)
            ORDER BY f.created_at DESC
        """, (lead_id,))
        followups = cursor.fetchall()
    
    return followups

@api_router.post("/leads/{lead_id}/followups")
def create_followup(lead_id: int, followup: FollowupCreate, current_user: dict = Depends(get_current_user)):
    """Log a new conversation/followup for a lead"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Parse dates
        followup_date = None
        if followup.followup_date:
            try:
                followup_date = datetime.strptime(followup.followup_date, '%Y-%m-%d').date()
            except:
                followup_date = datetime.now().date()
        else:
            followup_date = datetime.now().date()
            
        next_followup = None
        if followup.next_followup:
            try:
                next_followup = datetime.strptime(followup.next_followup, '%Y-%m-%dT%H:%M')
            except:
                pass
        
        cursor.execute("""
            INSERT INTO followups (lead_id, owner_id, channel, outcome, notes, followup_date, next_followup, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (lead_id, current_user['id'], followup.channel, followup.outcome, 
              followup.notes, followup_date, next_followup, datetime.now()))
        conn.commit()
        
        followup_id = cursor.lastrowid
        cursor.execute("""
            SELECT f.*, u.full_name as owner_name 
            FROM followups f
            LEFT JOIN users u ON f.owner_id = u.id
            WHERE f.id = %s
        """, (followup_id,))
        created = cursor.fetchone()
    
    return created

# ============= Reminder Routes (using actions table) =============
@api_router.get("/reminders")
def get_reminders(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get all actions/reminders with lead information"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT a.*, l.name as lead_name, l.phone as lead_phone
               FROM actions a
               LEFT JOIN leads l ON a.lead_id = l.id
               WHERE a.user_id = %s
               ORDER BY a.due_date ASC, a.due_time ASC LIMIT %s OFFSET %s""",
            (current_user['id'], limit, skip)
        )
        actions = cursor.fetchall()
        
        # Convert to expected frontend format
        result = []
        for a in actions:
            a_dict = dict(a)
            # Map actions columns to reminder format for frontend
            # Combine due_date and due_time into reminder_date
            if a_dict.get('due_date'):
                date_str = str(a_dict['due_date'])
                time_str = str(a_dict.get('due_time', '00:00:00') or '00:00:00')
                a_dict['reminder_date'] = f"{date_str}T{time_str}"
            
            # Map action_type to reminder_type
            a_dict['reminder_type'] = a_dict.get('action_type', 'Task')
            
            # Map description to notes
            a_dict['notes'] = a_dict.get('description')
            
            result.append(a_dict)
    
    return result

@api_router.post("/reminders")
def create_reminder(reminder: ReminderCreate, current_user: dict = Depends(get_current_user)):
    """Create a new action/reminder in the actions table"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Parse the reminder_date to extract date and time parts (IST)
        # Format expected: YYYY-MM-DDTHH:MM:SS (already in IST from frontend)
        reminder_datetime = reminder.reminder_date
        if isinstance(reminder_datetime, str) and 'T' in reminder_datetime:
            parts = reminder_datetime.split('T')
            date_part = parts[0]  # YYYY-MM-DD
            time_part = parts[1] if len(parts) > 1 else '00:00:00'  # HH:MM:SS
            # Ensure time format is correct
            if len(time_part) == 5:  # HH:MM
                time_part += ':00'
        else:
            date_part = str(reminder_datetime)[:10] if reminder_datetime else None
            time_part = '00:00:00'
        
        # Map status to valid enum values for actions table
        # actions status: 'Pending','Completed','Snoozed','Missed','Dismissed','Up Coming'
        status = reminder.status
        if status.lower() == 'pending':
            status = 'Pending'
        elif status.lower() == 'completed':
            status = 'Completed'
        
        # Insert into actions table
        cursor.execute(
            """INSERT INTO actions (user_id, lead_id, title, description, action_type, due_date, due_time, status, priority, is_notified)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (current_user['id'], reminder.lead_id, reminder.title, reminder.notes,
             reminder.reminder_type, date_part, time_part, status, reminder.priority or 'Medium', 0)
        )
        conn.commit()
        action_id = cursor.lastrowid
        
        cursor.execute(
            """SELECT a.*, l.name as lead_name, l.phone as lead_phone 
               FROM actions a
               LEFT JOIN leads l ON a.lead_id = l.id
               WHERE a.id = %s""", 
            (action_id,)
        )
        created = cursor.fetchone()
        
        # Format response for frontend
        if created:
            created = dict(created)
            if created.get('due_date'):
                date_str = str(created['due_date'])
                time_str = str(created.get('due_time', '00:00:00') or '00:00:00')
                created['reminder_date'] = f"{date_str}T{time_str}"
            created['reminder_type'] = created.get('action_type', 'Task')
            created['notes'] = created.get('description')
    
    return created

@api_router.put("/reminders/{reminder_id}")
def update_reminder(reminder_id: int, reminder_data: dict, current_user: dict = Depends(get_current_user)):
    """Update an action/reminder"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Handle reminder_date - split into due_date and due_time parts
        if 'reminder_date' in reminder_data:
            reminder_datetime = reminder_data['reminder_date']
            if isinstance(reminder_datetime, str) and 'T' in reminder_datetime:
                parts = reminder_datetime.split('T')
                reminder_data['due_date'] = parts[0]
                time_part = parts[1] if len(parts) > 1 else '00:00:00'
                if len(time_part) == 5:
                    time_part += ':00'
                reminder_data['due_time'] = time_part
            del reminder_data['reminder_date']
        
        # Map reminder_type to action_type
        if 'reminder_type' in reminder_data:
            reminder_data['action_type'] = reminder_data['reminder_type']
            del reminder_data['reminder_type']
        
        # Map notes to description
        if 'notes' in reminder_data:
            reminder_data['description'] = reminder_data['notes']
            del reminder_data['notes']
        
        # Map status
        if 'status' in reminder_data:
            status = reminder_data['status']
            if status.lower() == 'pending':
                reminder_data['status'] = 'Pending'
            elif status.lower() == 'completed':
                reminder_data['status'] = 'Completed'
                reminder_data['completed_at'] = datetime.now()
        
        # Build dynamic update query
        update_fields = []
        values = []
        
        allowed_fields = ['title', 'due_date', 'due_time', 'action_type', 'description', 'status', 'lead_id', 'priority', 'outcome', 'completed_at', 'is_notified']
        
        for field in allowed_fields:
            if field in reminder_data:
                update_fields.append(f"{field} = %s")
                values.append(reminder_data[field])
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        values.append(reminder_id)
        values.append(current_user['id'])
        query = f"UPDATE actions SET {', '.join(update_fields)} WHERE id = %s AND user_id = %s"
        
        cursor.execute(query, values)
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Action/Reminder not found")
        
        cursor.execute(
            """SELECT a.*, l.name as lead_name, l.phone as lead_phone 
               FROM actions a
               LEFT JOIN leads l ON a.lead_id = l.id
               WHERE a.id = %s""", 
            (reminder_id,)
        )
        updated = cursor.fetchone()
        
        # Format response
        if updated:
            updated = dict(updated)
            if updated.get('due_date'):
                date_str = str(updated['due_date'])
                time_str = str(updated.get('due_time', '00:00:00') or '00:00:00')
                updated['reminder_date'] = f"{date_str}T{time_str}"
            updated['reminder_type'] = updated.get('action_type', 'Task')
            updated['notes'] = updated.get('description')
    
    return updated

@api_router.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: int, current_user: dict = Depends(get_current_user)):
    """Delete an action/reminder"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM actions WHERE id = %s AND user_id = %s", (reminder_id, current_user['id']))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Action/Reminder not found")
    
    return {"message": "Action/Reminder deleted successfully"}

# ============= Dashboard Routes =============
@api_router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Total leads (exclude deleted)
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE (is_deleted IS NULL OR is_deleted = 0)")
        total_leads = cursor.fetchone()['count']
        
        # Client leads (buyer, tenant) - exclude deleted
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_type IN ('buyer', 'tenant') AND (is_deleted IS NULL OR is_deleted = 0)")
        client_leads = cursor.fetchone()['count']
        
        # Inventory leads (seller, landlord, builder) - exclude deleted
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_type IN ('seller', 'landlord', 'builder') AND (is_deleted IS NULL OR is_deleted = 0)")
        inventory_leads = cursor.fetchone()['count']
        
        # Temperature counts - exclude deleted
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_temperature = 'Hot' AND (is_deleted IS NULL OR is_deleted = 0)")
        hot_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_temperature = 'Warm' AND (is_deleted IS NULL OR is_deleted = 0)")
        warm_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_temperature = 'Cold' AND (is_deleted IS NULL OR is_deleted = 0)")
        cold_leads = cursor.fetchone()['count']
        
        # Builders
        cursor.execute("SELECT COUNT(*) as count FROM builders")
        total_builders = cursor.fetchone()['count']
        
        # Today's reminders
        today = datetime.utcnow().date()
        cursor.execute("SELECT COUNT(*) as count FROM reminders WHERE DATE(reminder_date) = %s", (today,))
        today_reminders = cursor.fetchone()['count']
        
        # Pending reminders
        cursor.execute("SELECT COUNT(*) as count FROM reminders WHERE status = 'pending'")
        pending_reminders = cursor.fetchone()['count']
    
    return DashboardStats(
        total_leads=total_leads,
        client_leads=client_leads,
        inventory_leads=inventory_leads,
        hot_leads=hot_leads,
        warm_leads=warm_leads,
        cold_leads=cold_leads,
        total_builders=total_builders,
        today_reminders=today_reminders,
        pending_reminders=pending_reminders
    )

# ============= Inventory File Upload Routes =============
MAX_IMAGES = 12
MAX_PDFS = 4
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
ALLOWED_PDF_TYPES = ['application/pdf']

# File upload directory - stored on server
UPLOAD_DIR = Path("/app/backend/uploads/inventory")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Base URL for accessing files
UPLOAD_BASE_URL = "/api/uploads/inventory"

@api_router.post("/inventory/{lead_id}/files")
async def upload_inventory_file(
    lead_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an image or PDF file for an inventory"""
    # Validate file type
    content_type = file.content_type or ''
    
    if content_type in ALLOWED_IMAGE_TYPES:
        file_type = 'image'
    elif content_type in ALLOWED_PDF_TYPES:
        file_type = 'pdf'
    else:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: images (JPEG, PNG, GIF, WebP, HEIC) and PDF")
    
    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    
    # Validate file size
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size: 10MB")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if lead exists
        cursor.execute("SELECT id, lead_type FROM leads WHERE id = %s", (lead_id,))
        lead = cursor.fetchone()
        if not lead:
            raise HTTPException(status_code=404, detail="Inventory not found")
        
        # Count existing files
        cursor.execute(
            "SELECT file_type, COUNT(*) as count FROM inventory_files WHERE lead_id = %s AND is_deleted = 0 GROUP BY file_type",
            (lead_id,)
        )
        file_counts = {row['file_type']: row['count'] for row in cursor.fetchall()}
        
        image_count = file_counts.get('image', 0)
        pdf_count = file_counts.get('pdf', 0)
        
        if file_type == 'image' and image_count >= MAX_IMAGES:
            raise HTTPException(status_code=400, detail=f"Maximum {MAX_IMAGES} images allowed per inventory")
        
        if file_type == 'pdf' and pdf_count >= MAX_PDFS:
            raise HTTPException(status_code=400, detail=f"Maximum {MAX_PDFS} PDF files allowed per inventory")
        
        # Generate unique filename
        import uuid
        file_ext = Path(file.filename).suffix or ('.jpg' if file_type == 'image' else '.pdf')
        unique_filename = f"{lead_id}_{uuid.uuid4().hex}{file_ext}"
        
        # Create lead-specific directory
        lead_dir = UPLOAD_DIR / str(lead_id)
        lead_dir.mkdir(parents=True, exist_ok=True)
        
        # Save file to disk
        file_path = lead_dir / unique_filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        # Generate file URL
        file_url = f"{UPLOAD_BASE_URL}/{lead_id}/{unique_filename}"
        
        # Insert file record
        cursor.execute(
            """INSERT INTO inventory_files (lead_id, file_name, file_type, content_type, file_size, file_path, file_url, uploaded_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (lead_id, file.filename, file_type, content_type, file_size, str(file_path), file_url, current_user['id'])
        )
        conn.commit()
        file_id = cursor.lastrowid
        
    return {
        "id": file_id,
        "lead_id": lead_id,
        "file_name": file.filename,
        "file_type": file_type,
        "content_type": content_type,
        "file_size": file_size,
        "file_url": file_url,
        "message": "File uploaded successfully"
    }

@api_router.get("/inventory/{lead_id}/files")
def get_inventory_files(lead_id: int, current_user: dict = Depends(get_current_user)):
    """Get list of files for an inventory"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, lead_id, file_name, file_type, content_type, file_size, file_url, created_at
               FROM inventory_files
               WHERE lead_id = %s AND is_deleted = 0
               ORDER BY file_type, created_at DESC""",
            (lead_id,)
        )
        files = cursor.fetchall()
        
        # Format the response
        result = []
        for f in files:
            result.append({
                'id': f['id'],
                'lead_id': f['lead_id'],
                'file_name': f['file_name'],
                'file_type': f['file_type'],
                'content_type': f['content_type'],
                'file_size': f['file_size'],
                'file_url': f['file_url'],
                'created_at': f['created_at'].isoformat() if f['created_at'] else None
            })
        
    return result

@api_router.get("/uploads/inventory/{lead_id}/{filename}")
def serve_inventory_file(lead_id: int, filename: str):
    """Serve uploaded file"""
    file_path = UPLOAD_DIR / str(lead_id) / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type
    import mimetypes
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        content_type = 'application/octet-stream'
    
    with open(file_path, 'rb') as f:
        content = f.read()
    
    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename={filename}",
            "Cache-Control": "public, max-age=86400"
        }
    )

@api_router.delete("/inventory/files/{file_id}")
def delete_inventory_file(file_id: int, current_user: dict = Depends(get_current_user)):
    """Soft delete a file"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get file path before deleting
        cursor.execute("SELECT file_path FROM inventory_files WHERE id = %s", (file_id,))
        file_record = cursor.fetchone()
        
        cursor.execute(
            "UPDATE inventory_files SET is_deleted = 1 WHERE id = %s",
            (file_id,)
        )
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Optionally delete file from disk
        if file_record and file_record['file_path']:
            try:
                file_path = Path(file_record['file_path'])
                if file_path.exists():
                    file_path.unlink()
            except:
                pass  # Ignore file deletion errors
    
    return {"message": "File deleted successfully"}

@api_router.get("/inventory/{lead_id}/files/count")
def get_inventory_files_count(lead_id: int, current_user: dict = Depends(get_current_user)):
    """Get count of files for an inventory"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT file_type, COUNT(*) as count 
               FROM inventory_files 
               WHERE lead_id = %s AND is_deleted = 0 
               GROUP BY file_type""",
            (lead_id,)
        )
        counts = {row['file_type']: row['count'] for row in cursor.fetchall()}
        
    return {
        'images': counts.get('image', 0),
        'pdfs': counts.get('pdf', 0),
        'total': counts.get('image', 0) + counts.get('pdf', 0),
        'max_images': MAX_IMAGES,
        'max_pdfs': MAX_PDFS
    }

# ============= Tentative Pricing Routes =============
class PlotPricingCreate(BaseModel):
    location_id: int
    circle: str
    plot_size: int
    price_per_sq_yard: str
    min_price: float
    max_price: float
    tentative_price: Optional[float] = None
    floors: List[dict] = []  # [{floor_label: str, tentative_floor_price: str}]

@api_router.get("/pricing")
def get_all_pricing(current_user: dict = Depends(get_current_user)):
    """Get all tentative pricing grouped by location"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get all plot pricing with location info
        cursor.execute("""
            SELECT pp.*, l.name as location_name, l.colony_category, l.`Circle Rate` as location_circle_rate
            FROM plot_pricing pp
            JOIN locations l ON pp.location_id = l.id
            ORDER BY l.name ASC, pp.plot_size ASC
        """)
        plot_pricings = cursor.fetchall()
        
        # Get all floor pricing
        cursor.execute("""
            SELECT pf.* FROM plot_floor_pricing pf
            ORDER BY pf.plot_pricing_id ASC
        """)
        floor_pricings = cursor.fetchall()
        
        # Group floor pricing by plot_pricing_id
        floors_by_plot = {}
        for fp in floor_pricings:
            plot_id = fp['plot_pricing_id']
            if plot_id not in floors_by_plot:
                floors_by_plot[plot_id] = []
            floors_by_plot[plot_id].append({
                'id': fp['id'],
                'floor_label': fp['floor_label'],
                'tentative_floor_price': fp['tentative_floor_price']
            })
        
        # Group by location
        grouped = {}
        for pp in plot_pricings:
            loc_name = pp['location_name']
            if loc_name not in grouped:
                grouped[loc_name] = {
                    'location_id': pp['location_id'],
                    'location_name': loc_name,
                    'colony_category': pp['colony_category'],
                    'circle_rate': pp['location_circle_rate'] or pp['circle'],
                    'plots': []
                }
            
            grouped[loc_name]['plots'].append({
                'id': pp['id'],
                'plot_size': pp['plot_size'],
                'price_per_sq_yard': pp['price_per_sq_yard'],
                'min_price': float(pp['min_price']) if pp['min_price'] else 0,
                'max_price': float(pp['max_price']) if pp['max_price'] else 0,
                'tentative_price': float(pp['tentative_price']) if pp['tentative_price'] else None,
                'floors': floors_by_plot.get(pp['id'], [])
            })
        
        return list(grouped.values())

@api_router.get("/pricing/{pricing_id}")
def get_pricing_detail(pricing_id: int, current_user: dict = Depends(get_current_user)):
    """Get details for a specific plot pricing"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT pp.*, l.name as location_name, l.colony_category, l.`Circle Rate` as location_circle_rate
            FROM plot_pricing pp
            JOIN locations l ON pp.location_id = l.id
            WHERE pp.id = %s
        """, (pricing_id,))
        pricing = cursor.fetchone()
        
        if not pricing:
            raise HTTPException(status_code=404, detail="Pricing not found")
        
        # Get floor pricing
        cursor.execute("""
            SELECT * FROM plot_floor_pricing WHERE plot_pricing_id = %s
        """, (pricing_id,))
        floors = cursor.fetchall()
        
        result = dict(pricing)
        result['floors'] = [dict(f) for f in floors]
        return result

@api_router.post("/pricing")
def create_pricing(pricing: PlotPricingCreate, current_user: dict = Depends(get_current_user)):
    """Create new plot pricing with floor prices"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Insert plot pricing
        cursor.execute("""
            INSERT INTO plot_pricing (location_id, circle, plot_size, price_per_sq_yard, min_price, max_price, tentative_price, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
        """, (pricing.location_id, pricing.circle, pricing.plot_size, pricing.price_per_sq_yard, 
              pricing.min_price, pricing.max_price, pricing.tentative_price))
        conn.commit()
        
        plot_pricing_id = cursor.lastrowid
        
        # Insert floor pricing
        for floor in pricing.floors:
            if floor.get('floor_label') and floor.get('tentative_floor_price'):
                cursor.execute("""
                    INSERT INTO plot_floor_pricing (plot_pricing_id, floor_label, tentative_floor_price, created_at, updated_at)
                    VALUES (%s, %s, %s, NOW(), NOW())
                """, (plot_pricing_id, floor['floor_label'], floor['tentative_floor_price']))
        
        conn.commit()
        
        return {"id": plot_pricing_id, "message": "Pricing created successfully"}

@api_router.put("/pricing/{pricing_id}")
def update_pricing(pricing_id: int, pricing_data: dict, current_user: dict = Depends(get_current_user)):
    """Update plot pricing"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Update plot pricing
        update_fields = []
        values = []
        allowed_fields = ['location_id', 'circle', 'plot_size', 'price_per_sq_yard', 'min_price', 'max_price', 'tentative_price']
        
        for field in allowed_fields:
            if field in pricing_data:
                update_fields.append(f"{field} = %s")
                values.append(pricing_data[field])
        
        if update_fields:
            update_fields.append("updated_at = NOW()")
            values.append(pricing_id)
            query = f"UPDATE plot_pricing SET {', '.join(update_fields)} WHERE id = %s"
            cursor.execute(query, values)
        
        # Update floor pricing if provided
        if 'floors' in pricing_data:
            # Delete existing floors
            cursor.execute("DELETE FROM plot_floor_pricing WHERE plot_pricing_id = %s", (pricing_id,))
            
            # Insert new floors
            for floor in pricing_data['floors']:
                if floor.get('floor_label') and floor.get('tentative_floor_price'):
                    cursor.execute("""
                        INSERT INTO plot_floor_pricing (plot_pricing_id, floor_label, tentative_floor_price, created_at, updated_at)
                        VALUES (%s, %s, %s, NOW(), NOW())
                    """, (pricing_id, floor['floor_label'], floor['tentative_floor_price']))
        
        conn.commit()
        
        return {"message": "Pricing updated successfully"}

@api_router.delete("/pricing/{pricing_id}")
def delete_pricing(pricing_id: int, current_user: dict = Depends(get_current_user)):
    """Delete plot pricing and its floor prices"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Delete floor pricing first
        cursor.execute("DELETE FROM plot_floor_pricing WHERE plot_pricing_id = %s", (pricing_id,))
        
        # Delete plot pricing
        cursor.execute("DELETE FROM plot_pricing WHERE id = %s", (pricing_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Pricing not found")
        
        return {"message": "Pricing deleted successfully"}

@api_router.get("/locations/all")
def get_all_locations(current_user: dict = Depends(get_current_user)):
    """Get all locations with circle rates"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, colony_category, `Circle Rate` as circle_rate
            FROM locations
            ORDER BY name ASC
        """)
        locations = cursor.fetchall()
        return [dict(l) for l in locations]

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
