# Vercel Environment Variables Setup

The backend requires the following environment variables to be configured in the Vercel dashboard:

## Required Environment Variables

Add these in your Vercel project dashboard under Settings > Environment Variables:

### Database Configuration
- `DB_HOST` = shuttle.proxy.rlwy.net
- `DB_USER` = root
- `DB_PASSWORD` = ZBHSHGHuVXEmYCMzjgjFZIczSocHRIIa
- `DB_NAME` = crm_system
- `DB_PORT` = 57089

### JWT Configuration
- `JWT_SECRET` = your_jwt_secret_key_here (IMPORTANT: Change this to a secure random string for production!)

### Server Configuration
- `PORT` = 5000 (or leave empty to use Vercel's default)

## Steps to Add Environment Variables in Vercel:

1. Go to your Vercel dashboard
2. Select the backend project (datawyntechnologies-crm-backend)
3. Go to Settings > Environment Variables
4. Add each variable from the list above
5. Make sure to add them for all environments (Production, Preview, Development)
6. Redeploy the project after adding the variables

## Security Note

The current `JWT_SECRET` is set to "your_jwt_secret_key_here" which is not secure. Generate a secure random string for production use. You can generate one using:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
