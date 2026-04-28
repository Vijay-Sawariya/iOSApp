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
import asyncio

# Import for AI features
from emergentintegrations.llm.chat import LlmChat, UserMessage

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
    lead_source: Optional[str] = None
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
    # Enhanced stats
    missed_followups: int = 0
    upcoming_followups: int = 0
    leads_this_week: int = 0
    followups_completed_this_week: int = 0
    leads_converted_this_week: int = 0
    # Lead funnel stats
    new_leads: int = 0
    contacted_leads: int = 0
    qualified_leads: int = 0
    negotiating_leads: int = 0
    won_leads: int = 0

class AIMatchResult(BaseModel):
    buyer_id: int
    buyer_name: str
    inventory_id: int
    inventory_name: str
    location: str
    match_score: int
    match_reasons: List[str]

class AIMessageRequest(BaseModel):
    lead_id: int
    message_type: str  # first_contact, follow_up, negotiation, closing
    custom_context: Optional[str] = None

class AIMessageResponse(BaseModel):
    message: str
    lead_name: str
    message_type: str

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
    """Get CLIENT leads (buyer, tenant) - excludes deleted, includes next action/followup"""
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
        
        # Fetch next pending action/followup for each lead
        if leads:
            lead_ids = [lead['id'] for lead in leads]
            placeholders = ','.join(['%s'] * len(lead_ids))
            cursor.execute(
                f"""SELECT lead_id, due_date, due_time, title, status
                    FROM actions 
                    WHERE lead_id IN ({placeholders}) 
                    AND status IN ('Pending', 'Missed', 'Up Coming')
                    ORDER BY due_date ASC, due_time ASC""",
                lead_ids
            )
            all_actions = cursor.fetchall()
            
            # Group actions by lead_id and get the earliest one
            action_map = {}
            for a in all_actions:
                lead_id = a['lead_id']
                if lead_id not in action_map:
                    action_map[lead_id] = a
            
            # Add next_action to each lead
            for lead in leads:
                lead_id = lead['id']
                if lead_id in action_map:
                    action = action_map[lead_id]
                    lead['next_action_date'] = str(action['due_date']) if action['due_date'] else None
                    lead['next_action_time'] = str(action['due_time']) if action['due_time'] else None
                    lead['next_action_title'] = action['title']
                    lead['next_action_status'] = action['status']
    
    return leads

@api_router.get("/leads/{lead_id}/preferred-inventory")
def get_preferred_inventory_ids(
    lead_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get list of preferred/matched inventory IDs for a client lead"""
    with get_db() as conn:
        cursor = conn.cursor()
        # Get all matching_lead_id from preferred_leads for this client
        cursor.execute(
            """SELECT matching_lead_id 
               FROM preferred_leads 
               WHERE lead_id = %s AND matching_lead_id IS NOT NULL""",
            (lead_id,)
        )
        rows = cursor.fetchall()
    
    # Return list of inventory IDs
    inventory_ids = [row['matching_lead_id'] for row in rows]
    return {"client_id": lead_id, "preferred_inventory_ids": inventory_ids}

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

@api_router.get("/leads/search")
def search_leads(q: str, current_user: dict = Depends(get_current_user)):
    """Search leads by name or phone"""
    if len(q) < 2:
        return []
    
    search_term = f"%{q}%"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, name, phone, email, lead_type, lead_status, location 
               FROM leads 
               WHERE (is_deleted IS NULL OR is_deleted = 0)
               AND (name LIKE %s OR phone LIKE %s OR email LIKE %s)
               ORDER BY name ASC
               LIMIT 10""",
            (search_term, search_term, search_term)
        )
        leads = cursor.fetchall()
    
    return [dict(lead) for lead in leads]

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
                  'lead_source', 'notes', 'floor', 'area_size', 'car_parking_number', 'lift_available', 'unit',
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
            'lead_source': getattr(lead, 'lead_source', None),
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
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Delete related floor pricing first
            try:
                cursor.execute("DELETE FROM inventory_floor_pricing WHERE lead_id = %s", (lead_id,))
            except Exception as e:
                logging.warning(f"Could not delete floor pricing: {e}")
            
            # Delete related actions/followups
            try:
                cursor.execute("DELETE FROM actions WHERE lead_id = %s", (lead_id,))
            except Exception as e:
                logging.warning(f"Could not delete actions: {e}")
            
            # Delete the lead
            cursor.execute("DELETE FROM leads WHERE id = %s", (lead_id,))
            affected = cursor.rowcount
            conn.commit()
            
            if affected == 0:
                raise HTTPException(status_code=404, detail="Lead not found")
        
        return {"message": "Lead deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting lead {lead_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete lead: {str(e)}")

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
        
        # Today's reminders from actions table
        today = datetime.utcnow().date()
        cursor.execute("SELECT COUNT(*) as count FROM actions WHERE DATE(due_date) = %s AND status IN ('Pending', 'Up Coming')", (today,))
        today_reminders = cursor.fetchone()['count']
        
        # Pending reminders - all pending actions
        cursor.execute("SELECT COUNT(*) as count FROM actions WHERE status = 'Pending'")
        pending_reminders = cursor.fetchone()['count']
        
        # ===== Enhanced Stats =====
        
        # Missed follow-ups (past due date with Pending status)
        cursor.execute("""
            SELECT COUNT(*) as count FROM actions 
            WHERE (due_date < CURDATE() OR (due_date = CURDATE() AND due_time < CURTIME()))
            AND status = 'Pending'
        """)
        missed_followups = cursor.fetchone()['count']
        
        # Upcoming follow-ups (today and next 3 days)
        cursor.execute("""
            SELECT COUNT(*) as count FROM actions 
            WHERE due_date >= CURDATE() AND due_date <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)
            AND status IN ('Pending', 'Up Coming')
        """)
        upcoming_followups = cursor.fetchone()['count']
        
        # Leads added this week
        week_start = today - timedelta(days=today.weekday())
        cursor.execute("""
            SELECT COUNT(*) as count FROM leads 
            WHERE DATE(created_at) >= %s AND (is_deleted IS NULL OR is_deleted = 0)
        """, (week_start,))
        leads_this_week = cursor.fetchone()['count']
        
        # Follow-ups completed this week (use due_date since updated_at might not exist)
        cursor.execute("""
            SELECT COUNT(*) as count FROM actions 
            WHERE DATE(due_date) >= %s AND status = 'Completed'
        """, (week_start,))
        followups_completed_this_week = cursor.fetchone()['count']
        
        # Leads converted this week (status is Won, use created_at since updated_at might not exist)
        cursor.execute("""
            SELECT COUNT(*) as count FROM leads 
            WHERE lead_status = 'Won' AND (is_deleted IS NULL OR is_deleted = 0)
        """)
        leads_converted_this_week = cursor.fetchone()['count']
        
        # Lead funnel stats (for client leads only)
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_status = 'New' AND lead_type IN ('buyer', 'tenant') AND (is_deleted IS NULL OR is_deleted = 0)")
        new_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_status = 'Contacted' AND lead_type IN ('buyer', 'tenant') AND (is_deleted IS NULL OR is_deleted = 0)")
        contacted_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_status = 'Qualified' AND lead_type IN ('buyer', 'tenant') AND (is_deleted IS NULL OR is_deleted = 0)")
        qualified_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_status = 'Negotiating' AND lead_type IN ('buyer', 'tenant') AND (is_deleted IS NULL OR is_deleted = 0)")
        negotiating_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_status = 'Won' AND lead_type IN ('buyer', 'tenant') AND (is_deleted IS NULL OR is_deleted = 0)")
        won_leads = cursor.fetchone()['count']
    
    return DashboardStats(
        total_leads=total_leads,
        client_leads=client_leads,
        inventory_leads=inventory_leads,
        hot_leads=hot_leads,
        warm_leads=warm_leads,
        cold_leads=cold_leads,
        total_builders=total_builders,
        today_reminders=today_reminders,
        pending_reminders=pending_reminders,
        missed_followups=missed_followups,
        upcoming_followups=upcoming_followups,
        leads_this_week=leads_this_week,
        followups_completed_this_week=followups_completed_this_week,
        leads_converted_this_week=leads_converted_this_week,
        new_leads=new_leads,
        contacted_leads=contacted_leads,
        qualified_leads=qualified_leads,
        negotiating_leads=negotiating_leads,
        won_leads=won_leads
    )

# ============= AI Features Routes =============

# Initialize LLM key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

@api_router.get("/ai/smart-matches", response_model=List[AIMatchResult])
def get_smart_matches(current_user: dict = Depends(get_current_user), limit: int = 5):
    """Get AI-powered smart matches between buyers and inventory"""
    matches = []
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get active buyers with preferences
        cursor.execute("""
            SELECT id, name, location, budget_min, budget_max, floor, bhk, building_facing, property_type
            FROM leads 
            WHERE lead_type IN ('buyer', 'tenant') 
            AND lead_status NOT IN ('Won', 'Closed/Lost', 'Lost')
            AND (is_deleted IS NULL OR is_deleted = 0)
            ORDER BY RAND()
            LIMIT 20
        """)
        buyers = cursor.fetchall()
        
        # Get available inventory
        cursor.execute("""
            SELECT id, name, location, budget_min, budget_max, floor, bhk, building_facing, property_type, area_size
            FROM leads 
            WHERE lead_type IN ('seller', 'landlord', 'builder') 
            AND lead_status NOT IN ('Sold', 'Closed/Lost', 'Lost')
            AND (is_deleted IS NULL OR is_deleted = 0)
            LIMIT 100
        """)
        inventory = cursor.fetchall()
        
        # Simple matching algorithm
        for buyer in buyers:
            buyer_locations = set((buyer.get('location') or '').lower().split(','))
            buyer_locations = {loc.strip() for loc in buyer_locations if loc.strip()}
            buyer_budget_min = float(buyer.get('budget_min') or 0)
            buyer_budget_max = float(buyer.get('budget_max') or 999999)
            buyer_floors = set((buyer.get('floor') or '').lower().split(','))
            buyer_floors = {f.strip() for f in buyer_floors if f.strip()}
            
            for inv in inventory:
                score = 0
                reasons = []
                
                # Location match
                inv_location = (inv.get('location') or '').lower().strip()
                if inv_location and any(loc in inv_location or inv_location in loc for loc in buyer_locations if loc):
                    score += 40
                    reasons.append(f"Location match: {inv.get('location')}")
                
                # Budget match
                inv_budget = float(inv.get('budget_min') or inv.get('budget_max') or 0)
                if inv_budget > 0:
                    if buyer_budget_min <= inv_budget <= buyer_budget_max:
                        score += 30
                        reasons.append(f"Budget in range")
                    elif buyer_budget_min * 0.8 <= inv_budget <= buyer_budget_max * 1.2:
                        score += 15
                        reasons.append(f"Budget close to range")
                
                # Floor match
                inv_floors = set((inv.get('floor') or '').lower().split(','))
                inv_floors = {f.strip() for f in inv_floors if f.strip()}
                if buyer_floors and inv_floors and buyer_floors.intersection(inv_floors):
                    score += 20
                    reasons.append(f"Floor preference match")
                
                # BHK match
                if buyer.get('bhk') and inv.get('bhk') and buyer.get('bhk') == inv.get('bhk'):
                    score += 10
                    reasons.append(f"BHK match: {inv.get('bhk')}")
                
                if score >= 40 and reasons:
                    matches.append({
                        'buyer_id': buyer['id'],
                        'buyer_name': buyer['name'],
                        'inventory_id': inv['id'],
                        'inventory_name': inv['name'] or f"Inventory #{inv['id']}",
                        'location': inv.get('location') or 'N/A',
                        'match_score': min(score, 100),
                        'match_reasons': reasons
                    })
        
        # Sort by score and return top matches
        matches.sort(key=lambda x: x['match_score'], reverse=True)
        return matches[:limit]

@api_router.get("/ai/urgent-followups")
def get_urgent_followups(current_user: dict = Depends(get_current_user), limit: int = 10):
    """Get urgent follow-ups (missed + today's)"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get missed and today's follow-ups
        cursor.execute("""
            SELECT a.id, a.lead_id, a.title, a.due_date, a.due_time, a.status,
                   l.name as lead_name, l.phone as lead_phone, l.lead_type
            FROM actions a
            JOIN leads l ON a.lead_id = l.id
            WHERE a.status IN ('Pending', 'Up Coming')
            AND (a.due_date < CURDATE() OR a.due_date = CURDATE())
            AND (l.is_deleted IS NULL OR l.is_deleted = 0)
            ORDER BY a.due_date ASC, a.due_time ASC
            LIMIT %s
        """, (limit,))
        
        followups = cursor.fetchall()
        
        result = []
        today = datetime.utcnow().date()
        
        for f in followups:
            due_date = f['due_date']
            is_missed = due_date < today if due_date else False
            
            result.append({
                'id': f['id'],
                'lead_id': f['lead_id'],
                'lead_name': f['lead_name'],
                'lead_phone': f['lead_phone'],
                'lead_type': f['lead_type'],
                'title': f['title'],
                'due_date': str(due_date) if due_date else None,
                'due_time': str(f['due_time']) if f['due_time'] else None,
                'status': 'Missed' if is_missed else 'Due Today',
                'is_missed': is_missed
            })
        
        return result

@api_router.post("/ai/generate-message", response_model=AIMessageResponse)
async def generate_ai_message(request: AIMessageRequest, current_user: dict = Depends(get_current_user)):
    """Generate AI-powered follow-up message for WhatsApp"""
    
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI features not configured")
    
    # Get lead details
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT l.*, a.title as last_action_title, a.due_date as last_action_date
            FROM leads l
            LEFT JOIN actions a ON l.id = a.lead_id AND a.status = 'Pending'
            WHERE l.id = %s
            ORDER BY a.due_date DESC
            LIMIT 1
        """, (request.lead_id,))
        lead = cursor.fetchone()
        
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
    
    # Build context for AI
    lead_name = lead.get('name', 'Customer')
    lead_type = lead.get('lead_type', 'buyer')
    location = lead.get('location', '')
    budget_min = lead.get('budget_min', 0)
    budget_max = lead.get('budget_max', 0)
    property_type = lead.get('property_type', '')
    bhk = lead.get('bhk', '')
    
    message_templates = {
        'first_contact': f"Generate a warm, professional WhatsApp message for first contact with a {lead_type} named {lead_name}. They are interested in {bhk or 'a property'} in {location or 'the area'}. Budget range: {budget_min}-{budget_max} Cr. Keep it brief and friendly.",
        'follow_up': f"Generate a professional follow-up WhatsApp message for {lead_name} who is a {lead_type}. They showed interest in {property_type or 'property'} in {location}. Remind them about our discussion and ask about their decision. Keep it brief.",
        'negotiation': f"Generate a negotiation-focused WhatsApp message for {lead_name}. They are interested in {bhk} {property_type or 'property'} in {location} with budget {budget_min}-{budget_max} Cr. Mention flexibility and value. Keep it professional.",
        'closing': f"Generate a closing WhatsApp message for {lead_name} to finalize the deal. They are a {lead_type} interested in {location}. Create urgency while being professional. Keep it brief."
    }
    
    prompt = message_templates.get(request.message_type, message_templates['follow_up'])
    if request.custom_context:
        prompt += f" Additional context: {request.custom_context}"
    
    prompt += " Respond ONLY with the message text, no explanations. Use Hindi-English mix for natural conversation. Keep it under 100 words."
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"message-gen-{request.lead_id}",
            system_message="You are a helpful real estate assistant who generates professional WhatsApp messages. Keep messages brief, friendly, and professional. Use natural Hindi-English mix."
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return AIMessageResponse(
            message=response.strip(),
            lead_name=lead_name,
            message_type=request.message_type
        )
    except Exception as e:
        logging.error(f"AI message generation error: {e}")
        # Fallback to template messages
        fallback_messages = {
            'first_contact': f"Hi {lead_name}, This is from Sagar Home. I understand you're looking for a property in {location}. I have some excellent options that match your requirements. Would you like to discuss? 🏠",
            'follow_up': f"Hi {lead_name}, Hope you're doing well! Just wanted to follow up on our earlier conversation about properties in {location}. Any updates from your side? Let me know if you need more details. 😊",
            'negotiation': f"Hi {lead_name}, I've spoken with the owner and there's some flexibility on the pricing for the {location} property. This is a great opportunity. Shall we discuss further? 📞",
            'closing': f"Hi {lead_name}, Great news! Everything is set for the {location} property. Let's finalize the paperwork soon to secure this deal for you. When can we meet? 🎉"
        }
        return AIMessageResponse(
            message=fallback_messages.get(request.message_type, fallback_messages['follow_up']),
            lead_name=lead_name,
            message_type=request.message_type
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

# ============= Site Visit Scheduler =============

class SiteVisitCreate(BaseModel):
    lead_id: int
    property_lead_id: Optional[int] = None  # The inventory/property to visit
    visit_date: str
    visit_time: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "Scheduled"  # Scheduled, Completed, Cancelled, Rescheduled

class SiteVisitResponse(BaseModel):
    id: int
    lead_id: int
    property_lead_id: Optional[int]
    visit_date: str
    visit_time: Optional[str]
    location: Optional[str]
    notes: Optional[str]
    status: str
    lead_name: Optional[str]
    property_name: Optional[str]
    created_by: Optional[int]
    created_at: Optional[str]

@api_router.get("/site-visits")
def get_site_visits(current_user: dict = Depends(get_current_user), status: Optional[str] = None):
    """Get all site visits"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # First check if table exists, create if not
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS site_visits (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    lead_id INT,
                    property_lead_id INT,
                    visit_date DATE,
                    visit_time TIME,
                    location VARCHAR(255),
                    notes TEXT,
                    status VARCHAR(50) DEFAULT 'Scheduled',
                    created_by INT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
            
            query = """
                SELECT sv.*, 
                       l.name as lead_name, l.phone as lead_phone,
                       p.name as property_name, p.location as property_location
                FROM site_visits sv
                LEFT JOIN leads l ON sv.lead_id = l.id
                LEFT JOIN leads p ON sv.property_lead_id = p.id
                WHERE sv.created_by = %s
            """
            params = [current_user['id']]
            
            if status:
                query += " AND sv.status = %s"
                params.append(status)
            
            query += " ORDER BY sv.visit_date ASC, sv.visit_time ASC"
            cursor.execute(query, params)
            visits = cursor.fetchall()
            return [dict(v) for v in visits]
    except Exception as e:
        logging.error(f"Site visits error: {e}")
        return []

@api_router.post("/site-visits")
def create_site_visit(visit: SiteVisitCreate, current_user: dict = Depends(get_current_user)):
    """Create a new site visit"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO site_visits (lead_id, property_lead_id, visit_date, visit_time, location, notes, status, created_by, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """, (visit.lead_id, visit.property_lead_id, visit.visit_date, visit.visit_time, 
              visit.location, visit.notes, visit.status or 'Scheduled', current_user['id']))
        conn.commit()
        return {"id": cursor.lastrowid, "message": "Site visit scheduled successfully"}

@api_router.put("/site-visits/{visit_id}")
def update_site_visit(visit_id: int, visit: SiteVisitCreate, current_user: dict = Depends(get_current_user)):
    """Update a site visit"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE site_visits SET lead_id=%s, property_lead_id=%s, visit_date=%s, visit_time=%s, 
            location=%s, notes=%s, status=%s WHERE id=%s AND created_by=%s
        """, (visit.lead_id, visit.property_lead_id, visit.visit_date, visit.visit_time,
              visit.location, visit.notes, visit.status, visit_id, current_user['id']))
        conn.commit()
        return {"message": "Site visit updated successfully"}

@api_router.delete("/site-visits/{visit_id}")
def delete_site_visit(visit_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a site visit"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM site_visits WHERE id=%s AND created_by=%s", (visit_id, current_user['id']))
        conn.commit()
        return {"message": "Site visit deleted successfully"}

# ============= Deal/Transaction Tracker =============

class DealCreate(BaseModel):
    lead_id: int
    property_lead_id: Optional[int] = None
    deal_amount: Optional[float] = None
    commission_percent: Optional[float] = None
    commission_amount: Optional[float] = None
    status: Optional[str] = "Negotiation"  # Negotiation, Agreement, Documentation, Payment, Closed, Cancelled
    payment_received: Optional[float] = 0
    notes: Optional[str] = None
    expected_closing_date: Optional[str] = None

@api_router.get("/deals")
def get_deals(current_user: dict = Depends(get_current_user), status: Optional[str] = None):
    """Get all deals"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # First check if table exists, create if not
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS deals (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    lead_id INT,
                    property_lead_id INT,
                    deal_amount DECIMAL(15,2),
                    commission_percent DECIMAL(5,2),
                    commission_amount DECIMAL(15,2),
                    status VARCHAR(50) DEFAULT 'Negotiation',
                    payment_received DECIMAL(15,2) DEFAULT 0,
                    notes TEXT,
                    expected_closing_date DATE,
                    created_by INT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
            
            # Try to add missing columns if table already existed
            try:
                cursor.execute("ALTER TABLE deals ADD COLUMN property_lead_id INT")
                conn.commit()
            except:
                pass  # Column already exists
            
            # Check if property_lead_id column exists
            cursor.execute("SHOW COLUMNS FROM deals LIKE 'property_lead_id'")
            has_property_lead_id = cursor.fetchone() is not None
            
            if has_property_lead_id:
                query = """
                    SELECT d.*, 
                           l.name as lead_name, l.phone as lead_phone,
                           p.name as property_name, p.location as property_location
                    FROM deals d
                    LEFT JOIN leads l ON d.lead_id = l.id
                    LEFT JOIN leads p ON d.property_lead_id = p.id
                    WHERE 1=1
                """
            else:
                query = """
                    SELECT d.*, 
                           l.name as lead_name, l.phone as lead_phone,
                           NULL as property_name, NULL as property_location
                    FROM deals d
                    LEFT JOIN leads l ON d.lead_id = l.id
                    WHERE 1=1
                """
            params = []
            
            if current_user['role'] != 'admin':
                query += " AND d.created_by = %s"
                params.append(current_user['id'])
            
            if status:
                query += " AND d.status = %s"
                params.append(status)
            
            query += " ORDER BY d.created_at DESC"
            cursor.execute(query, params)
            deals = cursor.fetchall()
            return [dict(d) for d in deals]
    except Exception as e:
        logging.error(f"Deals error: {e}")
        return []

@api_router.post("/deals")
def create_deal(deal: DealCreate, current_user: dict = Depends(get_current_user)):
    """Create a new deal"""
    with get_db() as conn:
        cursor = conn.cursor()
        commission = deal.commission_amount or (deal.deal_amount * deal.commission_percent / 100 if deal.deal_amount and deal.commission_percent else 0)
        cursor.execute("""
            INSERT INTO deals (lead_id, property_lead_id, deal_amount, commission_percent, commission_amount, 
            status, payment_received, notes, expected_closing_date, created_by, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """, (deal.lead_id, deal.property_lead_id, deal.deal_amount, deal.commission_percent, commission,
              deal.status or 'Negotiation', deal.payment_received or 0, deal.notes, deal.expected_closing_date, current_user['id']))
        conn.commit()
        return {"id": cursor.lastrowid, "message": "Deal created successfully"}

@api_router.put("/deals/{deal_id}")
def update_deal(deal_id: int, deal: DealCreate, current_user: dict = Depends(get_current_user)):
    """Update a deal"""
    with get_db() as conn:
        cursor = conn.cursor()
        commission = deal.commission_amount or (deal.deal_amount * deal.commission_percent / 100 if deal.deal_amount and deal.commission_percent else 0)
        cursor.execute("""
            UPDATE deals SET lead_id=%s, property_lead_id=%s, deal_amount=%s, commission_percent=%s, 
            commission_amount=%s, status=%s, payment_received=%s, notes=%s, expected_closing_date=%s
            WHERE id=%s
        """, (deal.lead_id, deal.property_lead_id, deal.deal_amount, deal.commission_percent, commission,
              deal.status, deal.payment_received, deal.notes, deal.expected_closing_date, deal_id))
        conn.commit()
        return {"message": "Deal updated successfully"}

@api_router.delete("/deals/{deal_id}")
def delete_deal(deal_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a deal"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM deals WHERE id=%s", (deal_id,))
        conn.commit()
        return {"message": "Deal deleted successfully"}

# ============= Activity Log / Timeline =============

@api_router.get("/leads/{lead_id}/activity")
def get_lead_activity(lead_id: int, current_user: dict = Depends(get_current_user)):
    """Get activity timeline for a lead"""
    activities = []
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get follow-ups/actions
        cursor.execute("""
            SELECT 'followup' as type, id, title as description, due_date as activity_date, 
                   status, created_at, NULL as created_by_name
            FROM actions WHERE lead_id = %s
            ORDER BY created_at DESC
        """, (lead_id,))
        followups = cursor.fetchall()
        for f in followups:
            activities.append({
                'type': 'followup',
                'id': f['id'],
                'description': f['description'],
                'date': str(f['activity_date']) if f['activity_date'] else str(f['created_at']),
                'status': f['status'],
                'icon': 'calendar'
            })
        
        # Get site visits
        cursor.execute("""
            SELECT 'visit' as type, id, CONCAT('Site Visit: ', COALESCE(location, 'Property')) as description,
                   visit_date as activity_date, status, created_at
            FROM site_visits WHERE lead_id = %s
            ORDER BY created_at DESC
        """, (lead_id,))
        visits = cursor.fetchall()
        for v in visits:
            activities.append({
                'type': 'visit',
                'id': v['id'],
                'description': v['description'],
                'date': str(v['activity_date']) if v['activity_date'] else str(v['created_at']),
                'status': v['status'],
                'icon': 'location'
            })
        
        # Get deals
        cursor.execute("""
            SELECT 'deal' as type, id, CONCAT('Deal: ₹', COALESCE(deal_amount, 0), ' Cr') as description,
                   expected_closing_date as activity_date, status, created_at
            FROM deals WHERE lead_id = %s
            ORDER BY created_at DESC
        """, (lead_id,))
        deals = cursor.fetchall()
        for d in deals:
            activities.append({
                'type': 'deal',
                'id': d['id'],
                'description': d['description'],
                'date': str(d['activity_date']) if d['activity_date'] else str(d['created_at']),
                'status': d['status'],
                'icon': 'cash'
            })
    
    # Sort by date descending
    activities.sort(key=lambda x: x['date'] if x['date'] else '', reverse=True)
    return activities

# ============= Team Management =============

@api_router.get("/activity-logs")
def get_activity_logs(current_user: dict = Depends(get_current_user), limit: int = 50):
    """Get recent activity logs across all leads"""
    activities = []
    
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Get recent follow-ups/actions with lead names
            cursor.execute("""
                SELECT a.id, a.lead_id, a.title, a.action_type, a.description, a.status, 
                       a.created_at, l.name as lead_name, u.full_name as created_by
                FROM actions a
                LEFT JOIN leads l ON a.lead_id = l.id
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.created_at DESC
                LIMIT %s
            """, (limit,))
            actions = cursor.fetchall()
            
            for a in actions:
                activities.append({
                    'id': a['id'],
                    'lead_id': a['lead_id'],
                    'lead_name': a['lead_name'] or f"Lead #{a['lead_id']}" if a['lead_id'] else 'Unknown',
                    'action_type': a['action_type'] or 'Task',
                    'description': a['title'] or a['description'] or 'Activity',
                    'created_by': a['created_by'] or 'System',
                    'created_at': a['created_at'].isoformat() if a['created_at'] else None
                })
            
            # Get recent site visits (wrapped in try-catch)
            try:
                cursor.execute("""
                    SELECT sv.id, sv.lead_id, sv.location, sv.status, sv.visit_date, sv.created_at,
                           l.name as lead_name, u.full_name as created_by
                    FROM site_visits sv
                    LEFT JOIN leads l ON sv.lead_id = l.id
                    LEFT JOIN users u ON sv.created_by = u.id
                    ORDER BY sv.created_at DESC
                    LIMIT %s
                """, (limit // 2,))
                visits = cursor.fetchall()
                
                for v in visits:
                    activities.append({
                        'id': v['id'] + 10000,
                        'lead_id': v['lead_id'],
                        'lead_name': v['lead_name'] or f"Lead #{v['lead_id']}" if v['lead_id'] else 'Unknown',
                        'action_type': 'visit',
                        'description': f"Site visit at {v['location'] or 'property'} - {v['status']}",
                        'created_by': v['created_by'] or 'System',
                        'created_at': v['created_at'].isoformat() if v['created_at'] else (v['visit_date'].isoformat() if v.get('visit_date') else None)
                    })
            except Exception as e:
                logging.warning(f"Could not fetch site visits for activity log: {e}")
            
            # Get recent deals (wrapped in try-catch, with flexible column handling)
            try:
                cursor.execute("""
                    SELECT d.id, d.lead_id, d.created_at,
                           l.name as lead_name
                    FROM deals d
                    LEFT JOIN leads l ON d.lead_id = l.id
                    ORDER BY d.created_at DESC
                    LIMIT %s
                """, (limit // 2,))
                deals = cursor.fetchall()
                
                for d in deals:
                    activities.append({
                        'id': d['id'] + 20000,
                        'lead_id': d['lead_id'],
                        'lead_name': d['lead_name'] or f"Lead #{d['lead_id']}" if d['lead_id'] else 'Unknown',
                        'action_type': 'deal',
                        'description': "Deal created",
                        'created_by': 'System',
                        'created_at': d['created_at'].isoformat() if d['created_at'] else None
                    })
            except Exception as e:
                logging.warning(f"Could not fetch deals for activity log: {e}")
        
        # Sort all activities by created_at descending
        activities.sort(key=lambda x: x['created_at'] or '', reverse=True)
        return activities[:limit]
    except Exception as e:
        logging.error(f"Activity logs error: {e}")
        return []

@api_router.get("/team/members")
def get_team_members(current_user: dict = Depends(get_current_user)):
    """Get all team members (admin only)"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, full_name, email, role, created_at,
                   (SELECT COUNT(*) FROM leads WHERE created_by = users.id) as lead_count
            FROM users ORDER BY full_name
        """)
        members = cursor.fetchall()
        return [dict(m) for m in members]

@api_router.post("/team/assign-lead")
def assign_lead_to_member(lead_id: int, user_id: int, current_user: dict = Depends(get_current_user)):
    """Assign a lead to a team member"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE leads SET assigned_to = %s WHERE id = %s", (user_id, lead_id))
        conn.commit()
        return {"message": "Lead assigned successfully"}

@api_router.get("/team/performance")
def get_team_performance(current_user: dict = Depends(get_current_user)):
    """Get team performance stats"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.full_name, u.username,
                   COUNT(DISTINCT l.id) as total_leads,
                   SUM(CASE WHEN l.lead_status = 'Won' THEN 1 ELSE 0 END) as won_deals,
                   COUNT(DISTINCT sv.id) as site_visits,
                   COUNT(DISTINCT a.id) as followups_done
            FROM users u
            LEFT JOIN leads l ON l.created_by = u.id
            LEFT JOIN site_visits sv ON sv.created_by = u.id
            LEFT JOIN actions a ON a.user_id = u.id AND a.status = 'Completed'
            GROUP BY u.id, u.full_name, u.username
            ORDER BY total_leads DESC
        """)
        performance = cursor.fetchall()
        return [dict(p) for p in performance]

# ============= Bulk Import/Export =============

@api_router.post("/leads/bulk-import")
async def bulk_import_leads(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Import leads from CSV file"""
    import csv
    import io
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    imported = 0
    errors = []
    
    with get_db() as conn:
        cursor = conn.cursor()
        for row in reader:
            try:
                cursor.execute("""
                    INSERT INTO leads (name, phone, email, lead_type, location, budget_min, budget_max, 
                    property_type, bhk, lead_temperature, lead_status, notes, created_by, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (
                    row.get('name', ''),
                    row.get('phone', ''),
                    row.get('email', ''),
                    row.get('lead_type', 'buyer'),
                    row.get('location', ''),
                    float(row.get('budget_min', 0)) if row.get('budget_min') else None,
                    float(row.get('budget_max', 0)) if row.get('budget_max') else None,
                    row.get('property_type', ''),
                    row.get('bhk', ''),
                    row.get('lead_temperature', 'Hot'),
                    row.get('lead_status', 'New'),
                    row.get('notes', ''),
                    current_user['id']
                ))
                imported += 1
            except Exception as e:
                errors.append(f"Row {imported + 1}: {str(e)}")
        conn.commit()
    
    return {"imported": imported, "errors": errors}

@api_router.get("/leads/export")
def export_leads(lead_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Export leads to CSV format"""
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM leads WHERE (is_deleted IS NULL OR is_deleted = 0)"
        params = []
        
        if lead_type:
            query += " AND lead_type = %s"
            params.append(lead_type)
        
        cursor.execute(query, params)
        leads = cursor.fetchall()
        
        # Convert to list of dicts
        return [dict(l) for l in leads]

# ============= Property Gallery =============

@api_router.get("/leads/{lead_id}/gallery")
def get_property_gallery(lead_id: int, current_user: dict = Depends(get_current_user)):
    """Get all images for a property"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, lead_id, file_name, file_path, file_type, file_size, uploaded_at
            FROM inventory_files WHERE lead_id = %s AND file_type LIKE 'image/%'
            ORDER BY uploaded_at DESC
        """, (lead_id,))
        images = cursor.fetchall()
        return [dict(img) for img in images]

# ============= Map/Location Features =============

@api_router.get("/leads/map-data")
def get_leads_for_map(lead_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get leads with location data for map view"""
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT l.id, l.name, l.lead_type, l.location, l.address, l.Property_locationUrl,
                   l.budget_min, l.budget_max, l.bhk, l.area_size, loc.latitude, loc.longitude
            FROM leads l
            LEFT JOIN locations loc ON LOWER(l.location) LIKE CONCAT('%', LOWER(loc.location), '%')
            WHERE (l.is_deleted IS NULL OR l.is_deleted = 0)
            AND l.location IS NOT NULL AND l.location != ''
        """
        params = []
        
        if lead_type:
            query += " AND l.lead_type = %s"
            params.append(lead_type)
        
        query += " LIMIT 100"
        cursor.execute(query, params)
        leads = cursor.fetchall()
        return [dict(l) for l in leads]

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
