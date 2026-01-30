#!/bin/bash

# Quick start script for Vanna AI Web Server

echo "=============================================="
echo "Vanna AI Web Server - Quick Start"
echo "=============================================="
echo ""

# Check if .env file exists and is configured
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure your credentials:"
    echo "  cp .env.example .env"
    echo "  nano .env  # or use your preferred editor"
    exit 1
fi

# Check if placeholder values are still in .env
if grep -q "your_anthropic_api_key_here" .env || grep -q "your_supabase_password_here" .env; then
    echo "⚠️  Warning: .env file contains placeholder values"
    echo "Please edit .env and add your actual credentials:"
    echo "  - ANTHROPIC_API_KEY"
    echo "  - SUPABASE credentials"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Activate virtual environment
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment not found!"
    echo "Please run: python3 -m venv venv"
    exit 1
fi

echo "✓ Activating virtual environment..."
source venv/bin/activate

# Check if dependencies are installed
echo "✓ Checking dependencies..."
python -c "import vanna" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Error: Vanna not installed!"
    echo "Please run: pip install -e 'vanna/[anthropic,postgres,fastapi]' python-dotenv"
    exit 1
fi

echo "✓ Starting Vanna AI Web Server..."
echo ""
echo "🌐 Server will be available at: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Run the web server
python vanna_web_server.py
