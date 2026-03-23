from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
import pymysql
from pymysql.cursors import DictCursor
from contextlib import contextmanager
import re

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
    
    # Get circle rate from location table
    cursor = conn.cursor()
    cursor.execute("SELECT circle_rate FROM locations WHERE LOWER(name) = LOWER(%s)", (location,))
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
    bhk: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    property_type: Optional[str] = None
    lead_temperature: Optional[str] = "Hot"
    lead_status: Optional[str] = "New"
    notes: Optional[str] = None
    builder_id: Optional[int] = None

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
    reminder_date: datetime
    reminder_type: str
    notes: Optional[str]
    status: str
    created_at: Optional[datetime]

class ReminderCreate(BaseModel):
    lead_id: Optional[int] = None
    title: str
    reminder_date: datetime
    reminder_type: str
    notes: Optional[str] = None
    status: str = "pending"

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
@api_router.get("/leads/clients", response_model=List[LeadResponse])
def get_client_leads(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get CLIENT leads (buyer, tenant)"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM leads WHERE lead_type IN ('buyer', 'tenant') ORDER BY created_at DESC LIMIT %s OFFSET %s",
            (limit, skip)
        )
        leads = cursor.fetchall()
    
    return [LeadResponse(**lead) for lead in leads]

@api_router.get("/leads/inventory", response_model=List[LeadResponse])
def get_inventory_leads(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get INVENTORY leads (seller, landlord, builder)"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM leads WHERE lead_type IN ('seller', 'landlord', 'builder') ORDER BY created_at DESC LIMIT %s OFFSET %s",
            (limit, skip)
        )
        leads = cursor.fetchall()
    
    return [LeadResponse(**lead) for lead in leads]

@api_router.get("/leads", response_model=List[LeadResponse])
def get_all_leads(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get all leads"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM leads ORDER BY created_at DESC LIMIT %s OFFSET %s",
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
    
    # Calculate circle values and plot specifications
    calculations = {}
    
    # Only calculate for inventory leads with required data
    if lead.get('lead_type') in ['seller', 'landlord', 'builder'] and lead.get('area_size') and lead.get('location'):
        try:
            # Parse floors from notes
            floors_str = None
            notes = lead.get('notes', '')
            if notes:
                match = re.search(r'Floors:\s*([^\\n]+)', notes)
                if match:
                    floors_str = match.group(1).strip()
            
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
            
            # Parse floor pricing
            floor_pricing = parse_floor_pricing_from_notes(notes)
            if floor_pricing:
                calculations['floor_pricing'] = floor_pricing
                
        except Exception as e:
            logging.error(f"Calculation error for lead {lead_id}: {e}")
            calculations['error'] = str(e)
    
    # Return lead with calculations
    response = dict(lead)
    response['calculations'] = calculations
    
    return response

@api_router.post("/leads", response_model=LeadResponse)
def create_lead(lead: LeadCreate, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO leads (name, phone, email, lead_type, location, bhk, budget_min, budget_max,
               property_type, lead_temperature, lead_status, notes, created_at, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (lead.name, lead.phone, lead.email, lead.lead_type, lead.location, lead.bhk,
             lead.budget_min, lead.budget_max, lead.property_type, lead.lead_temperature, lead.lead_status, 
             lead.notes, datetime.utcnow(), current_user['id'])
        )
        conn.commit()
        lead_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM leads WHERE id = %s", (lead_id,))
        created = cursor.fetchone()
    
    return LeadResponse(**created)

@api_router.put("/leads/{lead_id}", response_model=LeadResponse)
def update_lead(lead_id: int, lead: LeadCreate, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE leads SET name=%s, phone=%s, email=%s, lead_type=%s, location=%s,
               bhk=%s, budget_min=%s, budget_max=%s, property_type=%s, lead_temperature=%s, lead_status=%s, notes=%s
               WHERE id=%s""",
            (lead.name, lead.phone, lead.email, lead.lead_type, lead.location, lead.bhk,
             lead.budget_min, lead.budget_max, lead.property_type, lead.lead_temperature, lead.lead_status, lead.notes, lead_id)
        )
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        cursor.execute("SELECT * FROM leads WHERE id = %s", (lead_id,))
        updated = cursor.fetchone()
    
    return LeadResponse(**updated)

@api_router.delete("/leads/{lead_id}")
def delete_lead(lead_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM leads WHERE id = %s", (lead_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lead not found")
    
    return {"message": "Lead deleted successfully"}

# ============= Builder Routes =============
@api_router.get("/builders", response_model=List[BuilderResponse])
def get_builders(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM builders ORDER BY created_at DESC LIMIT %s OFFSET %s",
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

# ============= Reminder Routes =============
@api_router.get("/reminders", response_model=List[ReminderResponse])
def get_reminders(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM reminders ORDER BY reminder_date ASC LIMIT %s OFFSET %s",
            (limit, skip)
        )
        reminders = cursor.fetchall()
    
    return [ReminderResponse(**reminder) for reminder in reminders]

@api_router.post("/reminders", response_model=ReminderResponse)
def create_reminder(reminder: ReminderCreate, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO reminders (lead_id, title, reminder_date, reminder_type, notes, status, created_at, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (reminder.lead_id, reminder.title, reminder.reminder_date, reminder.reminder_type,
             reminder.notes, reminder.status, datetime.utcnow(), current_user['id'])
        )
        conn.commit()
        reminder_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM reminders WHERE id = %s", (reminder_id,))
        created = cursor.fetchone()
    
    return ReminderResponse(**created)

@api_router.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: int, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM reminders WHERE id = %s", (reminder_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Reminder not found")
    
    return {"message": "Reminder deleted successfully"}

# ============= Dashboard Routes =============
@api_router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Total leads
        cursor.execute("SELECT COUNT(*) as count FROM leads")
        total_leads = cursor.fetchone()['count']
        
        # Client leads (buyer, tenant)
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_type IN ('buyer', 'tenant')")
        client_leads = cursor.fetchone()['count']
        
        # Inventory leads (seller, landlord, builder)
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_type IN ('seller', 'landlord', 'builder')")
        inventory_leads = cursor.fetchone()['count']
        
        # Temperature counts
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_temperature = 'Hot'")
        hot_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_temperature = 'Warm'")
        warm_leads = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM leads WHERE lead_temperature = 'Cold'")
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
