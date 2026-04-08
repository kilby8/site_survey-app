# Android Development - Quick Reference

## 🚀 Start Development

### Full Stack (DB + Backend + Android)
```bash
npm run dev:android
```

### Mobile Only
```bash
cd mobile
npm run android:emulator
```

## 🔧 Troubleshooting Commands

### Device Not Found?
```bash
cd mobile
npm run android:reset-adb
```

### Check Your Setup
```bash
cd mobile
npm run android:diagnose
```

### Manual ADB Commands
```bash
adb kill-server
adb start-server
adb devices -l
```

## 📱 Emulator Management

### From Command Line
```bash
# List available emulators
emulator -list-avds

# Start specific emulator
emulator -avd <name> -no-snapshot-load
```

### From Android Studio
Tools > Device Manager > Play button

## 🌐 Backend Connectivity

### Test from Host
```bash
curl http://localhost:3001/api/health
```

### Test from Emulator
Use your machine's IP (not localhost):
```bash
# Find your IP
ipconfig  # Windows
ifconfig  # Mac/Linux

# Update in mobile/.env or client.ts
http://192.168.x.x:3001
```

## 🐳 Docker Commands

```bash
# Start database
docker compose up -d

# Check status
docker ps

# Stop everything
docker compose down
```

## 📝 All Mobile Scripts

| Command | Description |
|---------|-------------|
| `npm run android:emulator` | ⭐ Auto-start emulator & run |
| `npm run android` | Safe run with checks |
| `npm run android:test-device` | Quick device connectivity test |
| `npm run android:diagnose` | Full environment check |
| `npm run android:reset-adb` | Quick ADB reset |
| `npm run android:unsafe` | Direct Expo run |
| `npm start` | Expo dev server only |

## 🆘 Common Fixes

| Problem | Solution |
|---------|----------|
| No devices found | `npm run android:reset-adb` |
| Emulator won't start | Open Android Studio Device Manager |
| Backend unreachable | Use 192.168.x.x not localhost |
| Build fails | `npx expo prebuild --clean` |

## 📖 Full Documentation

- `mobile/ANDROID_TROUBLESHOOTING.md` - Complete guide
- `mobile/ANDROID_FIX_SUMMARY.md` - Implementation details

---
**Quick Health Check**: `cd mobile && npm run android:diagnose`
