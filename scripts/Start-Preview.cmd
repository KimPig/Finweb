@echo off
title Finweb Preview - http://127.0.0.1:8097/
cd /d "%~dp0.."
python -m http.server 8097 --bind 127.0.0.1 --directory dist
