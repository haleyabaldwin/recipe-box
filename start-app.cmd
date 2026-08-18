@echo off
cd /d "%~dp0"
echo Starting Recipe Box at http://localhost:3000
start "" http://localhost:3000
npm start
