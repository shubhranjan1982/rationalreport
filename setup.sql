-- TradeBot Pro - MySQL Setup Script for Hostinger
-- Run this on your Hostinger MySQL database via phpMyAdmin

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL DEFAULT '',
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'owner',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50) NOT NULL DEFAULT '',
    password VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL DEFAULT '',
    sebi_reg_number VARCHAR(100) NOT NULL DEFAULT '',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_months INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    gst_percent DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36) NOT NULL,
    plan_id VARCHAR(36) NOT NULL,
    start_date VARCHAR(20) NOT NULL,
    end_date VARCHAR(20) NOT NULL,
    amount_paid DECIMAL(10,2) NOT NULL,
    gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_note TEXT,
    confirmed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS owner_settings (
    id VARCHAR(36) PRIMARY KEY,
    gst_enabled TINYINT(1) NOT NULL DEFAULT 0,
    gst_number VARCHAR(50) NOT NULL DEFAULT '',
    business_name VARCHAR(255) NOT NULL DEFAULT '',
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    owner_phone VARCHAR(50) NOT NULL DEFAULT '',
    webhook_enabled TINYINT(1) NOT NULL DEFAULT 0,
    webhook_provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    webhook_secret VARCHAR(255) NOT NULL DEFAULT '',
    razorpay_key_id VARCHAR(255) NOT NULL DEFAULT '',
    razorpay_key_secret VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analyst_settings (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36),
    analyst_name VARCHAR(255) NOT NULL DEFAULT '',
    sebi_reg_number VARCHAR(100) NOT NULL DEFAULT '',
    company_name VARCHAR(255) NOT NULL DEFAULT '',
    website_url VARCHAR(500) NOT NULL DEFAULT '',
    telegram_bot_token VARCHAR(500) NOT NULL DEFAULT '',
    paid_channel_id VARCHAR(100) NOT NULL DEFAULT '',
    free_channel_id VARCHAR(100) NOT NULL DEFAULT '',
    automation_time VARCHAR(10) NOT NULL DEFAULT '16:00',
    signature_image_path VARCHAR(500),
    logo_image_path VARCHAR(500),
    disclaimer_text TEXT,
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    kite_api_key VARCHAR(255) NOT NULL DEFAULT '',
    kite_api_secret VARCHAR(255) NOT NULL DEFAULT '',
    kite_access_token VARCHAR(500) NOT NULL DEFAULT '',
    kite_token_expiry VARCHAR(30) NOT NULL DEFAULT '',
    ai_provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
    ai_api_key VARCHAR(500) NOT NULL DEFAULT '',
    private_relay_channel_id VARCHAR(100) NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36),
    trade_date VARCHAR(20) NOT NULL,
    stock_name VARCHAR(100) NOT NULL,
    option_type VARCHAR(50) NOT NULL DEFAULT '',
    strike_price DECIMAL(10,2),
    lot_size INT NOT NULL DEFAULT 1,
    entry_price DECIMAL(10,2) NOT NULL,
    exit_price DECIMAL(10,2),
    stop_loss DECIMAL(10,2),
    targets TEXT,
    highest_target_hit DECIMAL(10,2),
    profit_loss DECIMAL(10,2),
    profit_loss_amount DECIMAL(10,2),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    trade_type VARCHAR(50) NOT NULL DEFAULT 'INTRADAY',
    segment VARCHAR(50) NOT NULL DEFAULT 'STOCK OPTION',
    is_reentry TINYINT(1) NOT NULL DEFAULT 0,
    parent_trade_id VARCHAR(36),
    is_approved TINYINT(1) NOT NULL DEFAULT 0,
    is_excluded TINYINT(1) NOT NULL DEFAULT 0,
    is_posted TINYINT(1) NOT NULL DEFAULT 0,
    entry_message_id VARCHAR(100),
    exit_message_id VARCHAR(100),
    raw_messages TEXT,
    notes TEXT,
    rationale TEXT,
    strategy TEXT,
    chart_screenshots TEXT,
    channel_group_id VARCHAR(36),
    oi_buildup_type VARCHAR(50) NOT NULL DEFAULT '',
    oi_change_pct DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36),
    trade_id VARCHAR(36) NOT NULL,
    trade_date VARCHAR(20) NOT NULL,
    report_type VARCHAR(50) NOT NULL DEFAULT 'rationale',
    content TEXT,
    pdf_path VARCHAR(500),
    is_generated TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_summaries (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36),
    summary_date VARCHAR(20) NOT NULL,
    total_trades INT NOT NULL DEFAULT 0,
    profit_trades INT NOT NULL DEFAULT 0,
    loss_trades INT NOT NULL DEFAULT 0,
    total_profit_loss DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    is_posted TINYINT(1) NOT NULL DEFAULT 0,
    image_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channel_groups (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36),
    name VARCHAR(255) NOT NULL,
    segment VARCHAR(100) NOT NULL,
    paid_channel_id VARCHAR(100) NOT NULL,
    free_channel_id VARCHAR(100) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_consents (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36) NOT NULL DEFAULT '',
    client_name VARCHAR(255) NOT NULL DEFAULT '',
    client_email VARCHAR(255) NOT NULL DEFAULT '',
    report_id VARCHAR(36) NOT NULL,
    report_title VARCHAR(500) NOT NULL DEFAULT '',
    download_format VARCHAR(20) NOT NULL DEFAULT 'pdf',
    disclaimer_text TEXT,
    consent_given TINYINT(1) NOT NULL DEFAULT 1,
    ip_address VARCHAR(100) NOT NULL DEFAULT '',
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oi_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36),
    snapshot_date VARCHAR(20) NOT NULL,
    snapshot_time VARCHAR(20) NOT NULL DEFAULT '',
    data_source VARCHAR(50) NOT NULL DEFAULT 'kite',
    data LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screener_presets (
    id VARCHAR(36) PRIMARY KEY,
    client_id VARCHAR(36),
    name VARCHAR(255) NOT NULL,
    filters TEXT,
    sort_field VARCHAR(100) NOT NULL DEFAULT '',
    sort_direction VARCHAR(10) NOT NULL DEFAULT 'desc',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed owner account (email: shubhranjan1982@gmail.com, password: Ranju_1212)
-- The password hash will be auto-generated on first login
INSERT INTO users (id, username, email, password, role) VALUES (
    'owner-001', 'admin', 'shubhranjan1982@gmail.com', 'Ranju_1212', 'owner'
) ON DUPLICATE KEY UPDATE id=id;
