# Sagar Home - Self-Hosted Deployment Guide

This guide walks you through deploying your Lead Management System with:
- **Backend**: FastAPI on Railway/Render
- **Database**: Your existing GoDaddy MySQL
- **Mobile App**: iOS build via Expo EAS

---

## Prerequisites

1. **GitHub Account** - To store your code
2. **Railway or Render Account** - For backend hosting (free tier available)
3. **Apple Developer Account** - For iOS App Store ($99/year)
4. **Expo Account** - Free at https://expo.dev

---

## Step 1: Push Code to GitHub

### From Emergent:
1. Click the **GitHub icon** in the top-right corner
2. Connect your GitHub account (if not already)
3. Create a new repository named `sagar-home-lms`
4. Push the code

### Clone Locally:
```bash
git clone https://github.com/YOUR_USERNAME/sagar-home-lms.git
cd sagar-home-lms
```

---

## Step 2: Deploy Backend to Railway

### 2.1 Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub

### 2.2 Create New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Select your `sagar-home-lms` repository
4. Choose the `backend` folder as root directory

### 2.3 Configure Environment Variables
In Railway dashboard → Your Project → Variables tab:

```
MYSQL_HOST=p3plzcpnl509293.prod.phx3.secureserver.net
MYSQL_PORT=3306
MYSQL_USER=LMSUser
MYSQL_PASSWORD=Welcome@Sagar99
MYSQL_DATABASE=SagarHomeLMS
JWT_SECRET_KEY=qrFaA43e69M2ndjfDbXffjfEljdK-Q6IScjXuTPwVi8
```

### 2.4 Configure Build Settings
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`

### 2.5 Deploy
1. Click **"Deploy"**
2. Wait for deployment to complete
3. Copy your Railway URL (e.g., `https://sagar-home-lms-production.up.railway.app`)

---

## Step 3: Alternative - Deploy to Render

### 3.1 Create Render Account
1. Go to https://render.com
2. Sign up with GitHub

### 3.2 Create Web Service
1. Click **"New" → "Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `sagar-home-backend`
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`

### 3.3 Add Environment Variables
Same as Railway (see Step 2.3)

### 3.4 Deploy
Click **"Create Web Service"** and wait for deployment.

---

## Step 4: Update Frontend for Production

### 4.1 Update Backend URL

Edit `frontend/.env`:
```bash
# Replace with your actual Railway/Render URL
EXPO_PUBLIC_BACKEND_URL=https://your-backend-url.railway.app
```

### 4.2 Update app.json for Production

Edit `frontend/app.json`:
```json
{
  "expo": {
    "name": "Sagar Home",
    "slug": "sagar-home",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.sagarhome.lms",
      "buildNumber": "1"
    },
    "android": {
      "package": "com.sagarhome.lms",
      "versionCode": 1
    }
  }
}
```

---

## Step 5: Build iOS App with Expo EAS

### 5.1 Install EAS CLI
```bash
npm install -g eas-cli
```

### 5.2 Login to Expo
```bash
eas login
```

### 5.3 Configure EAS Build
```bash
cd frontend
eas build:configure
```

This creates `eas.json`. Update it:
```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "ios": {
        "resourceClass": "m-medium"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 5.4 Build for iOS
```bash
# For TestFlight/App Store
eas build --platform ios --profile production

# For internal testing (Ad Hoc)
eas build --platform ios --profile preview
```

### 5.5 Submit to App Store
```bash
eas submit --platform ios
```

---

## Step 6: Build Android App (Optional)

```bash
# For Google Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

---

## Verification Checklist

### Backend:
- [ ] Railway/Render deployment successful
- [ ] API responds at `https://your-url.railway.app/api/auth/login`
- [ ] Database connection working (can login with credentials)

### Frontend:
- [ ] `EXPO_PUBLIC_BACKEND_URL` updated to production URL
- [ ] `bundleIdentifier` set in app.json
- [ ] EAS build completes successfully
- [ ] App connects to backend API

### Database:
- [ ] GoDaddy MySQL accessible from Railway/Render
- [ ] Firewall allows connections from hosting provider

---

## Troubleshooting

### "Cannot connect to MySQL"
- Check if GoDaddy allows remote MySQL connections
- Add Railway/Render IP to GoDaddy whitelist
- Verify credentials are correct

### "API not responding"
- Check Railway/Render logs for errors
- Verify PORT environment variable is used
- Ensure `requirements.txt` is complete

### "iOS build fails"
- Ensure Apple Developer account is active
- Check bundle identifier is unique
- Review EAS build logs

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Render Docs**: https://render.com/docs
- **Expo EAS Docs**: https://docs.expo.dev/build/introduction/
- **GoDaddy MySQL**: https://www.godaddy.com/help/mysql-databases-1178

---

## Cost Summary

| Service | Cost |
|---------|------|
| Railway | $5 credit/month (free tier) |
| Render | 750 hrs/month free |
| Apple Developer | $99/year |
| Google Play | $25 one-time |
| Expo EAS | Free tier available |

**Total minimum**: ~$99/year (just Apple Developer fee)
