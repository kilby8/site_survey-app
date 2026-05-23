@echo off
cd /d C:\Users\carpe\StudioProjects\site_survey-app\mobile
"C:\Program Files\nodejs\npm.cmd" exec eas update -- --branch production --message deploy:all

