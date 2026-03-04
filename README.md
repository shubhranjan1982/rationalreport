# TradeBot Pro (Rational Report) - Node.js Self-Hosted Version

SEBI Registered Research Analyst Automation Platform — Self-hosted Node.js/Express/MySQL version for Hostinger Business hosting.

---

## Step-by-Step Hostinger Deployment Guide

### STEP 1: Get Hostinger Business Hosting

You need **Hostinger Business** or **Cloud** hosting (not the basic Starter plan) because it includes Node.js support.

- Go to [hostinger.com](https://www.hostinger.com) and purchase Business or Cloud hosting
- Complete domain setup and access your **hPanel** (Hostinger's control panel)

---

### STEP 2: Create MySQL Database

1. Log in to **hPanel** (panel.hostinger.com)
2. Go to **Databases** → **MySQL Databases**
3. Create a new database:
   - Database name: `tradebot_pro` (or any name you prefer)
   - Database username: (pick a username, e.g. `tradebot_user`)
   - Database password: (pick a strong password — **save this, you'll need it**)
4. Click **Create**
5. Note down these 3 values:
   - Database name (e.g. `u123456789_tradebot_pro`)
   - Database username (e.g. `u123456789_tradebot_user`)
   - Database password (whatever you chose)

> Hostinger adds a prefix like `u123456789_` to the database name and username automatically.

---

### STEP 3: Import Database Tables

1. In hPanel, go to **Databases** → **phpMyAdmin**
2. Click **Enter phpMyAdmin** next to your database
3. In phpMyAdmin, click your database name on the left sidebar
4. Click the **Import** tab at the top
5. Click **Choose File** and select the `setup.sql` file from this package
6. Click **Go** at the bottom
7. You should see a success message — your tables are now created

---

### STEP 4: Upload Files to Hostinger

**Option A: Using File Manager (Easier)**
1. In hPanel, go to **Files** → **File Manager**
2. Navigate to `public_html` folder
3. Create a new folder called `tradebot` (or any name)
4. Open the `tradebot` folder
5. Click **Upload Files** (top-left)
6. Upload ALL files from this `tradebot-pro-nodejs` folder
   - You can select all files and folders, or zip them first and upload the zip, then extract

**Option B: Using FTP (For large uploads)**
1. In hPanel, go to **Files** → **FTP Accounts**
2. Note your FTP host, username, and password
3. Use FileZilla or any FTP client to connect
4. Upload the entire `tradebot-pro-nodejs` folder contents to `public_html/tradebot/`

Your folder structure on Hostinger should look like:
```
public_html/
  tradebot/
    server.js
    package.json
    .env
    index.html
    setup.sql
    config/
    middleware/
    routes/
    utils/
    assets/
```

---

### STEP 5: Create the .env File

This is where you put all your API keys and database credentials.

1. In Hostinger File Manager, navigate to your app folder (`public_html/tradebot/`)
2. Click **New File** (top-left) and name it `.env` (starts with a dot)
3. Paste the following content and replace each value with your actual credentials:

```
DB_HOST=localhost
DB_NAME=u123456789_tradebot_pro
DB_USER=u123456789_tradebot_user
DB_PASS=your_database_password_here
DB_PORT=3306
SESSION_SECRET=type-any-random-text-here-make-it-long
PORT=3000
```

**Where to get each value:**

| Variable | Where to find it |
|---|---|
| `DB_HOST` | Always `localhost` on Hostinger |
| `DB_NAME` | From Step 2 (with the `u123456789_` prefix) |
| `DB_USER` | From Step 2 (with the `u123456789_` prefix) |
| `DB_PASS` | The password you set in Step 2 |
| `DB_PORT` | Always `3306` |
| `SESSION_SECRET` | Type any random long text (e.g. `my-super-secret-key-2024-xyz`) |
| `PORT` | Keep as `3000` (Hostinger sets this automatically) |

> **Note:** Kite API keys, Gemini AI key, and Telegram bot token are configured inside the app on the **Settings** page after your first login — NOT in the `.env` file.

4. Save the file

---

### STEP 6: Set Up Node.js on Hostinger

1. In hPanel, go to **Advanced** → **Node.js** (under the Websites section)
2. Click **Create a new application**
3. Fill in:
   - **Node.js version**: Select the latest available (24, 22, or 20)
   - **Application root**: `public_html/tradebot` (the folder where you uploaded files)
   - **Application startup file**: `server.js`
   - **Application URL**: Select your domain
4. Click **Create**
5. You'll see a **Run NPM Install** button — click it. This installs all the required packages (takes 1-2 minutes)
6. Once install finishes, click **Start** or **Restart**

---

### STEP 7: Access Your App

1. Open your browser and go to: `https://yourdomain.com` (or whatever domain you configured)
2. You should see the Rational Report login page
3. Click **Admin Login** and enter:
   - Username: `admin`
   - Password: `Ranju_1212`
4. You're in! The password will automatically upgrade to encrypted format on first login.
5. Go to **Settings** to configure your analyst details, Telegram channels, Kite API keys, AI provider, etc.

> **Note:** The default admin account is created automatically by the `setup.sql` script. To change the admin email or password, go to phpMyAdmin and update the `users` table directly.

---

## After Deployment: First-Time Setup Inside the App

Once logged in as admin:

1. **Settings Page** → Fill in your SEBI registration number, company name, analyst name, and other details
2. **Settings Page** → Add your Telegram channel IDs (paid channel, free channel)
3. **Settings Page** → Click "Connect Kite" to link your Zerodha account for live OI data
4. **Admin Panel** → Create subscription plans for your clients
5. **Admin Panel** → Manage client registrations and subscriptions
6. **Upload** your digital signature image for reports

---

## Updating the App

When you get a new version:

1. Upload the new files to Hostinger (overwrite existing ones)
2. In hPanel → Node.js → click **Restart** on your application
3. If there are database changes, import the new `setup.sql` using phpMyAdmin (it uses `IF NOT EXISTS` so it won't break existing data)

---

## Troubleshooting

**App shows blank page or error:**
- Check if Node.js is running in hPanel → Node.js section
- Click **Restart** on the application
- Check the error logs: hPanel → Files → Logs

**Database connection error:**
- Verify DB_NAME, DB_USER, DB_PASS in your `.env` file match exactly what Hostinger shows (including the prefix)
- Make sure DB_HOST is `localhost`

**"Cannot find module" error:**
- Go to hPanel → Node.js → click **Run NPM Install** again

**Kite Connect not working:**
- Make sure Kite API Key and Secret are correct in Settings page inside the app
- In Kite Developer Console, set your Redirect URL to `https://yourdomain.com/api/kite/callback`

**Telegram not sending messages:**
- Verify bot token is correct in Settings page inside the app
- Make sure the bot is added as admin to your Telegram channels
- Test from Settings page → "Test Telegram"

**AI Analysis not working:**
- Verify AI API key is correct in Settings page inside the app
- For Gemini, make sure the key is active at [Google AI Studio](https://aistudio.google.com/apikey)

---

## Project Structure

```
tradebot-pro-nodejs/
├── server.js                  # Main Express app
├── package.json               # Dependencies
├── .env.example               # Environment config template
├── .env                       # Your actual config (create this)
├── setup.sql                  # MySQL schema
├── index.html                 # SPA entry point
├── config/
│   └── database.js            # MySQL connection pool
├── middleware/
│   └── auth.js                # Authentication middleware
├── utils/
│   └── helpers.js             # Utility functions
├── routes/
│   ├── auth.js                # Login, register, logout
│   ├── settings.js            # Analyst settings
│   ├── trades.js              # Trade CRUD
│   ├── reports.js             # Report generation, PDF/Word download
│   ├── channel_groups.js      # Channel group management
│   ├── telegram.js            # Telegram bot integration
│   ├── upload.js              # File uploads (charts, signatures)
│   ├── kite.js                # Kite Connect / OI data
│   ├── oi.js                  # OI route mappings
│   ├── ai.js                  # AI analysis (Gemini)
│   ├── screener.js            # OI screener
│   ├── webhook.js             # Payment webhooks
│   ├── public_plans.js        # Public plan listing
│   ├── client_subscription.js # Client subscription info
│   └── admin/
│       ├── plans.js           # Subscription plan management
│       ├── clients.js         # Client management
│       ├── subscriptions.js   # Subscription management
│       ├── dashboard.js       # Admin dashboard stats
│       ├── settings.js        # Owner/GST settings
│       └── consents.js        # Consent log management
├── assets/                    # Frontend (CSS, JS, images)
└── uploads/                   # User uploads (created automatically)
```

## Requirements

- Hostinger Business or Cloud hosting (with Node.js support)
- Node.js 18 or higher (use the latest version available — 20, 22, or 24)
- MySQL 8.0+ (included with Hostinger)
