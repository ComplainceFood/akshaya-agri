# Akshaya Agri Solutions - Setup Guide

## Prerequisites
Make sure you have installed:
- Node.js (https://nodejs.org)
- Git
- PostgreSQL (https://www.postgresql.org/download/windows/)
- pnpm: open PowerShell and run:
    npm install -g pnpm

---

## Step 1: Install PostgreSQL
1. Download and install PostgreSQL from https://www.postgresql.org/download/windows/
2. During install, set a password for the "postgres" user - remember this password
3. Default port is 5432 - leave it as is

## Step 2: Create the Database
1. Open "pgAdmin 4" (installed with PostgreSQL) OR open Command Prompt and run:
    psql -U postgres
2. Create the database:
    CREATE DATABASE akshaya_agri;
3. Type \q to exit

## Step 3: Set up environment variables
1. Copy the file: C:\akshaya-agri\apps\api\.env.example
2. Rename the copy to: .env  (in the same folder)
3. Edit the .env file and replace "yourpassword" with your PostgreSQL password

The file should look like:
    DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/akshaya_agri"
    JWT_SECRET="akshaya-agri-secret-key-change-this-2024"
    PORT=3001

## Step 4: Install dependencies
Open PowerShell, go to the project folder, and run:
    cd C:\akshaya-agri
    pnpm install

## Step 5: Set up the database tables
    cd C:\akshaya-agri
    pnpm db:migrate

When prompted for a migration name, type: init

## Step 6: Add initial data (admin user + corn commodity)
    pnpm db:seed

This creates:
- Admin login: admin@akshayaagri.com
- Password: Admin@123
- Commodity: Maize (Corn)

## Step 7: Start the application
Open TWO PowerShell windows:

Window 1 (Backend API):
    cd C:\akshaya-agri
    pnpm dev:api

Window 2 (Frontend):
    cd C:\akshaya-agri
    pnpm dev:web

## Step 8: Open the app
Open your browser and go to:
    http://localhost:3000

Login with:
    Email: admin@akshayaagri.com
    Password: Admin@123

IMPORTANT: Change the admin password after first login via the Users page.

---

## Stopping the app
Press Ctrl+C in each PowerShell window.

## Starting again next time
Just repeat Step 7 - start both windows.
