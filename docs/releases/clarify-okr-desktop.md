# ClarityOKR Release Testing Documentation

**Product**: ClarityOKR Desktop
**Version**: TBD
**Release Date**: TBD
**Document Version**: 1.0

---

## Table of Contents

1. [Release Checklist](#release-checklist)
2. [Platform Testing](#platform-testing)
3. [Smoke Test Procedures](#smoke-test-procedures)
4. [Known Issues](#known-issues)
5. [Auto-Update Notes](#auto-update-notes)

---

## Release Checklist

### Pre-Release Verification Steps

Complete these steps before initiating the release build.

#### Code Verification

| Step | Task                                             | Status | Notes                                                                          |
| ---- | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| 1    | Verify all feature branches merged to main       | [ ]    |                                                                                |
| 2    | Confirm version bump in `package.json`           | [ ]    |                                                                                |
| 3    | Update `CHANGELOG.md` with release notes         | [ ]    |                                                                                |
| 4    | Verify no TODO/FIXME comments in production code | [ ]    | Run: `grep -r "TODO\|FIXME" app/ packages/ --include="*.ts" --include="*.tsx"` |
| 5    | Check for uncommitted changes                    | [ ]    | Run: `git status`                                                              |
| 6    | Verify license headers present                   | [ ]    | Check main source files                                                        |
| 7    | Review security scan results                     | [ ]    | Check for vulnerabilities in dependencies                                      |

#### Dependencies Verification

| Step | Task                                               | Status | Notes                             |
| ---- | -------------------------------------------------- | ------ | --------------------------------- |
| 8    | Update lockfile (`pnpm install --frozen-lockfile`) | [ ]    |                                   |
| 9    | Verify no deprecated dependencies                  | [ ]    | Run: `pnpm outdated`              |
| 10   | Check native dependencies compatibility            | [ ]    | Verify Electron ABI compatibility |
| 11   | Verify all `@clarityokr/*` packages built          | [ ]    | Run: `pnpm run build:contracts`   |

#### Documentation Verification

| Step | Task                               | Status | Notes                        |
| ---- | ---------------------------------- | ------ | ---------------------------- |
| 12   | Update README.md with new features | [ ]    |                              |
| 13   | Verify API documentation current   | [ ]    | Check contracts package docs |
| 14   | Update user-facing documentation   | [ ]    | Feature guides, tutorials    |
| 15   | Verify inline help text accurate   | [ ]    | Check renderer components    |

---

### Build Verification

Execute full build pipeline and verify artifacts.

#### Local Build Verification

```bash
# Clean build
pnpm run clean

# Full build
pnpm run build

# Verify all packages built
ls -la app/main/dist/
ls -la app/renderer/dist/
ls -la packages/contracts/dist/
```

| Step | Verification             | Expected Result                       | Status |
| ---- | ------------------------ | ------------------------------------- | ------ |
| 1    | Contracts package builds | `packages/contracts/dist/` exists     | [ ]    |
| 2    | Main process builds      | `app/main/dist/main.js` exists        | [ ]    |
| 3    | Renderer builds          | `app/renderer/dist/index.html` exists | [ ]    |
| 4    | No TypeScript errors     | `tsc --noEmit` passes                 | [ ]    |
| 5    | No ESLint errors         | `pnpm run lint` passes                | [ ]    |
| 6    | Prettier formatting      | `pnpm run format` passes              | [ ]    |

#### CI Build Verification

| Step | Verification                                        | Status |
| ---- | --------------------------------------------------- | ------ |
| 7    | CI pipeline passes                                  | [ ]    |
| 8    | All test suites pass (unit, integration, component) | [ ]    |
| 9    | E2E tests pass on all platforms                     | [ ]    |
| 10   | Code coverage meets threshold (80%)                 | [ ]    |
| 11   | Build artifacts generated                           | [ ]    |
| 12   | Sentry source maps uploaded (if enabled)            | [ ]    |

---

### Test Execution Checklist

Run the complete test suite before release.

#### Unit Tests

```bash
pnpm run test:unit
```

| Test Suite              | Status | Coverage |
| ----------------------- | ------ | -------- |
| Main process unit tests | [ ]    | >80%     |
| Contracts validators    | [ ]    | >80%     |
| State machine logic     | [ ]    | >80%     |
| Service layer tests     | [ ]    | >80%     |

#### Component Tests

```bash
pnpm run test:component
```

| Test Suite           | Status |
| -------------------- | ------ |
| Button component     | [ ]    |
| Card component       | [ ]    |
| Input component      | [ ]    |
| Spinner component    | [ ]    |
| Progress component   | [ ]    |
| Skeleton component   | [ ]    |
| Clarification wizard | [ ]    |
| OKR sticky note      | [ ]    |

#### Integration Tests

```bash
pnpm run test:integration
```

| Test Suite                | Status |
| ------------------------- | ------ |
| Database operations       | [ ]    |
| IPC channel communication | [ ]    |
| State persistence         | [ ]    |
| Repository patterns       | [ ]    |

#### E2E Tests

```bash
pnpm run test:e2e
```

| Test Suite               | Status |
| ------------------------ | ------ |
| App launch and startup   | [ ]    |
| Clarification flow       | [ ]    |
| OKR creation             | [ ]    |
| Window management        | [ ]    |
| Settings and preferences | [ ]    |

#### Manual Testing

| Test Area                     | Tester | Status |
| ----------------------------- | ------ | ------ |
| Fresh installation flow       |        | [ ]    |
| Upgrade from previous version |        | [ ]    |
| Offline functionality         |        | [ ]    |
| Error handling scenarios      |        | [ ]    |
| Performance under load        |        | [ ]    |

---

### Sign-Off Requirements

Obtain sign-off from all stakeholders before release.

| Role                            | Name | Date | Signature/Approval |
| ------------------------------- | ---- | ---- | ------------------ |
| QA Lead                         |      |      | [ ]                |
| Engineering Lead                |      |      | [ ]                |
| Product Manager                 |      |      | [ ]                |
| Security Review (if applicable) |      |      | [ ]                |
| Release Manager                 |      |      | [ ]                |

#### Final Release Approval Checklist

| Item                                | Status |
| ----------------------------------- | ------ |
| All critical and high bugs resolved | [ ]    |
| Known issues documented             | [ ]    |
| Release notes finalized             | [ ]    |
| Support team briefed                | [ ]    |
| Rollback plan ready                 | [ ]    |
| Monitoring alerts configured        | [ ]    |

---

## Platform Testing

### macOS Packaging and Testing

#### Build Requirements

- macOS 11+ (Big Sur or later)
- Xcode Command Line Tools
- Valid Apple Developer ID
- Notarization credentials

#### Build Steps

```bash
# Build for macOS
pnpm run build
pnpm run dist:mac

# Or with specific targets
pnpm run dist:mac -- --x64
pnpm run dist:mac -- --arm64
pnpm run dist:mac -- --universal
```

#### Testing Matrix

| macOS Version       | Architecture          | Status | Notes             |
| ------------------- | --------------------- | ------ | ----------------- |
| macOS 14 (Sonoma)   | Apple Silicon (arm64) | [ ]    | Primary target    |
| macOS 14 (Sonoma)   | Intel (x64)           | [ ]    |                   |
| macOS 13 (Ventura)  | Apple Silicon         | [ ]    |                   |
| macOS 13 (Ventura)  | Intel                 | [ ]    |                   |
| macOS 12 (Monterey) | Universal             | [ ]    | Minimum supported |

#### macOS-Specific Tests

| Test                      | Steps                                                   | Expected Result                              | Status |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------- | ------ |
| DMG Installation          | Mount DMG, drag to Applications                         | App copies without errors                    | [ ]    |
| Gatekeeper/Notarization   | Right-click open, check security prompt                 | "ClarityOKR" is from an identified developer | [ ]    |
| Code Signing              | `codesign -dv --verbose=4 /Applications/ClarityOKR.app` | Valid signature, no errors                   | [ ]    |
| Notarization              | `spctl -a -vv /Applications/ClarityOKR.app`             | Accepted, source=Notarized Developer ID      | [ ]    |
| Auto-launch on login      | System Preferences > Login Items                        | App appears in list when enabled             | [ ]    |
| Dock menu                 | Right-click dock icon                                   | Shows recent items and options               | [ ]    |
| Menu bar integration      | Check menu bar                                          | All menus functional                         | [ ]    |
| Dark mode                 | Toggle system dark mode                                 | UI adapts correctly                          | [ ]    |
| Touch Bar (if applicable) | Check Touch Bar                                         | Custom Touch Bar controls work               | [ ]    |
| Sandboxing                | Check entitlements                                      | App sandboxed correctly                      | [ ]    |

#### macOS Packaging Artifacts

| Artifact       | Location                                 | Verification             |
| -------------- | ---------------------------------------- | ------------------------ |
| DMG file       | `dist/ClarityOKR-[version].dmg`          | Mountable, contains app  |
| ZIP file       | `dist/ClarityOKR-[version]-mac.zip`      | Extractable, runs        |
| Blockmap       | `dist/ClarityOKR-[version].dmg.blockmap` | For differential updates |
| Latest-mac.yml | `dist/latest-mac.yml`                    | Update manifest          |

---

### Windows Packaging and Testing

#### Build Requirements

- Windows 10/11
- Visual Studio Build Tools 2019+
- Windows SDK
- Code signing certificate (optional but recommended)

#### Build Steps

```bash
# Build for Windows
pnpm run build
pnpm run dist:win

# Or with specific targets
pnpm run dist:win -- --x64
pnpm run dist:win -- --ia32
```

#### Testing Matrix

| Windows Version | Architecture | Status | Notes             |
| --------------- | ------------ | ------ | ----------------- |
| Windows 11 23H2 | x64          | [ ]    | Primary target    |
| Windows 11 22H2 | x64          | [ ]    |                   |
| Windows 10 22H2 | x64          | [ ]    | Minimum supported |
| Windows 10 21H2 | x64          | [ ]    |                   |

#### Windows-Specific Tests

| Test                    | Steps                                      | Expected Result                | Status |
| ----------------------- | ------------------------------------------ | ------------------------------ | ------ |
| MSI Installation        | Run MSI installer                          | Completes without errors       | [ ]    |
| EXE Installation        | Run setup.exe                              | Completes without errors       | [ ]    |
| Portable version        | Run portable executable                    | Runs without installation      | [ ]    |
| Code Signing            | Check file properties > Digital Signatures | Signature valid                | [ ]    |
| Start Menu shortcut     | Check Start Menu                           | Shortcut created               | [ ]    |
| Desktop shortcut        | Check Desktop                              | Shortcut created (if selected) | [ ]    |
| Uninstall from Settings | Settings > Apps > Uninstall                | Removes completely             | [ ]    |
| Windows Defender        | Check SmartScreen                          | No warnings for signed build   | [ ]    |
| System tray             | Minimize to tray                           | Icon appears, menu works       | [ ]    |
| High DPI                | 4K display at 200% scaling                 | UI scales correctly            | [ ]    |
| Multiple monitors       | Move between monitors                      | No rendering issues            | [ ]    |
| Taskbar pinning         | Pin to taskbar                             | Stays pinned after update      | [ ]    |

#### Windows Packaging Artifacts

| Artifact       | Location                                       | Verification             |
| -------------- | ---------------------------------------------- | ------------------------ |
| NSIS Installer | `dist/ClarityOKR Setup [version].exe`          | Installs correctly       |
| MSI Installer  | `dist/ClarityOKR-[version].msi`                | Installs correctly       |
| Portable       | `dist/ClarityOKR-[version].exe`                | Runs standalone          |
| Blockmap       | `dist/ClarityOKR Setup [version].exe.blockmap` | For differential updates |
| latest.yml     | `dist/latest.yml`                              | Update manifest          |

---

### Linux Packaging and Testing

#### Build Requirements

- Ubuntu 20.04+ or compatible
- Node.js 20.x
- Build dependencies: `build-essential`, `libgtk-3-dev`, `libnotify-dev`, `libgconf-2-4`, `libnss3`, `libxss1`, `libasound2`

#### Build Steps

```bash
# Build for Linux
pnpm run build
pnpm run dist:linux

# Specific targets
pnpm run dist:linux -- --AppImage
pnpm run dist:linux -- --deb
pnpm run dist:linux -- --rpm
pnpm run dist:linux -- --snap
pnpm run dist:linux -- --tar.gz
```

#### Testing Matrix

| Distribution | Version   | Package Format   | Status | Notes             |
| ------------ | --------- | ---------------- | ------ | ----------------- |
| Ubuntu       | 22.04 LTS | deb, AppImage    | [ ]    | Primary target    |
| Ubuntu       | 24.04 LTS | deb, AppImage    | [ ]    |                   |
| Fedora       | 40        | rpm, AppImage    | [ ]    |                   |
| Debian       | 12        | deb, AppImage    | [ ]    |                   |
| Arch Linux   | Rolling   | AppImage, tar.gz | [ ]    | Community support |

#### Linux-Specific Tests

| Test                         | Steps                                  | Expected Result                    | Status |
| ---------------------------- | -------------------------------------- | ---------------------------------- | ------ |
| DEB Installation             | `sudo dpkg -i *.deb`                   | Installs without dependency errors | [ ]    |
| DEB Uninstallation           | `sudo apt remove clarityokr`           | Removes cleanly                    | [ ]    |
| RPM Installation             | `sudo rpm -i *.rpm`                    | Installs correctly                 | [ ]    |
| RPM Uninstallation           | `sudo rpm -e clarityokr`               | Removes cleanly                    | [ ]    |
| AppImage Execution           | `chmod +x *.AppImage && ./*.AppImage`  | Runs without installation          | [ ]    |
| AppImage Desktop Integration | Check application menu                 | Appears in menu                    | [ ]    |
| Snap Installation            | `sudo snap install *.snap --dangerous` | Installs in confinement            | [ ]    |
| System tray                  | Check system tray                      | Icon and menu functional           | [ ]    |
| Desktop notifications        | Trigger notification                   | Displays correctly                 | [ ]    |
| File associations            | Open .okr files                        | Associated with ClarityOKR         | [ ]    |
| Wayland support              | Run on Wayland session                 | Renders correctly                  | [ ]    |
| X11 fallback                 | Run on X11 session                     | Renders correctly                  | [ ]    |

#### Linux Packaging Artifacts

| Artifact         | Location                               | Verification                 |
| ---------------- | -------------------------------------- | ---------------------------- |
| DEB Package      | `dist/clarityokr_[version]_amd64.deb`  | Installable on Debian/Ubuntu |
| RPM Package      | `dist/clarityokr-[version].x86_64.rpm` | Installable on Fedora/RHEL   |
| AppImage         | `dist/ClarityOKR-[version].AppImage`   | Executable on most distros   |
| Snap             | `dist/clarityokr_[version]_amd64.snap` | Installable via snap         |
| Tarball          | `dist/clarityokr-[version].tar.gz`     | Extract and run              |
| latest-linux.yml | `dist/latest-linux.yml`                | Update manifest              |

---

## Smoke Test Procedures

### Installation Verification

Test fresh installation on each supported platform.

#### Pre-Installation Checklist

| Item                                      | Status |
| ----------------------------------------- | ------ |
| Previous version uninstalled (clean test) | [ ]    |
| System meets minimum requirements         | [ ]    |
| Disk space sufficient (check: 500MB+)     | [ ]    |
| No conflicting processes running          | [ ]    |

#### Installation Steps

| Step | Action                               | Expected Result              | Status |
| ---- | ------------------------------------ | ---------------------------- | ------ |
| 1    | Download installer from release page | File downloads completely    | [ ]    |
| 2    | Verify file integrity (checksum)     | Matches published checksum   | [ ]    |
| 3    | Run installer                        | Installer launches           | [ ]    |
| 4    | Accept license agreement             | Proceeds to next step        | [ ]    |
| 5    | Select installation location         | Accepts custom path          | [ ]    |
| 6    | Complete installation                | Success message shown        | [ ]    |
| 7    | Launch application                   | App starts within 10 seconds | [ ]    |

#### Post-Installation Verification

| Check                         | How to Verify             | Status |
| ----------------------------- | ------------------------- | ------ |
| Application directory exists  | Check install location    | [ ]    |
| Log directory created         | `data/logs/` exists       | [ ]    |
| Database initialized          | `data/sessions.db` exists | [ ]    |
| Desktop shortcut created      | Check desktop             | [ ]    |
| Start Menu/Applications entry | Check menu                | [ ]    |
| First-run wizard appears      | Launch app                | [ ]    |

---

### Basic Functionality Tests

Verify core features work correctly.

#### Application Launch

| Test               | Steps                             | Expected Result                             | Status |
| ------------------ | --------------------------------- | ------------------------------------------- | ------ |
| Cold start         | Launch from desktop               | Window opens, no errors                     | [ ]    |
| Quick restart      | Close and reopen within 5 seconds | Starts normally                             | [ ]    |
| Multiple instances | Try to open second instance       | Prevented or handled gracefully             | [ ]    |
| Minimize to tray   | Click minimize                    | Minimizes to system tray                    | [ ]    |
| Restore from tray  | Click tray icon                   | Window restores                             | [ ]    |
| Close behavior     | Click X button                    | Minimizes to tray (if configured) or closes | [ ]    |

#### Clarification Flow

| Test                   | Steps                            | Expected Result                  | Status |
| ---------------------- | -------------------------------- | -------------------------------- | ------ |
| Start new session      | Click "New OKR"                  | Wizard opens at step 1           | [ ]    |
| Enter intent           | Type "improve team productivity" | Text accepted, validation passes | [ ]    |
| Progress through steps | Click Next/Continue              | Advances through wizard          | [ ]    |
| Select options         | Choose from presented options    | Selection recorded               | [ ]    |
| Generate OKRs          | Complete wizard                  | OKRs generated and displayed     | [ ]    |
| Save OKRs              | Click Save                       | Saved to database                | [ ]    |
| View saved OKRs        | Navigate to OKR list             | Shows saved OKRs                 | [ ]    |

#### OKR Sticky Note

| Test             | Steps                               | Expected Result             | Status |
| ---------------- | ----------------------------------- | --------------------------- | ------ |
| Open sticky note | Click "Open Sticky" or use shortcut | Sticky window appears       | [ ]    |
| Always on top    | Open other apps                     | Sticky stays on top         | [ ]    |
| Drag to move     | Click and drag title bar            | Moves freely                | [ ]    |
| Edit OKR inline  | Click text to edit                  | Edit mode activates         | [ ]    |
| Resize window    | Drag corner                         | Resizes (if enabled)        | [ ]    |
| Close sticky     | Click X                             | Closes, position remembered | [ ]    |

#### Settings and Preferences

| Test                   | Steps                    | Expected Result           | Status |
| ---------------------- | ------------------------ | ------------------------- | ------ |
| Open settings          | Menu > Settings          | Settings window opens     | [ ]    |
| Change theme           | Toggle light/dark        | Theme changes immediately | [ ]    |
| Set startup preference | Toggle "Start on login"  | Preference saved          | [ ]    |
| Configure shortcuts    | Change keyboard shortcut | New shortcut works        | [ ]    |
| Reset to defaults      | Click Reset              | Confirms, then resets     | [ ]    |

#### Data Persistence

| Test           | Steps                | Expected Result                   | Status |
| -------------- | -------------------- | --------------------------------- | ------ |
| Save session   | Create and save OKRs | Data persists after close         | [ ]    |
| Export data    | File > Export        | Export dialog opens, file created | [ ]    |
| Import data    | File > Import        | Import dialog opens, data loads   | [ ]    |
| Backup/restore | Trigger backup       | Backup file created, can restore  | [ ]    |

---

### Update Mechanism Testing

Verify the auto-update system works correctly.

#### Simulated Update Test

| Step | Action                                        | Expected Result                  | Status            |
| ---- | --------------------------------------------- | -------------------------------- | ----------------- | --- |
| 1    | Install older version                         | Previous version installed       | [ ]               |
| 2    | Configure update server to return new version | Update check detects new version | [ ]               |
| 3    | Trigger update check                          | Update notification appears      | [ ]               |
| 4    | Accept update                                 | Download begins                  | [ ]               |
| 5    | Wait for download                             | Download completes               | [ ]               |
| 6    | Install update                                | App restarts with new version    | [ ]               |
| 7    | Verify version                                | Check version number             | Shows new version | [ ] |

#### Manual Update Test

| Test                | Steps                    | Expected Result                      | Status |
| ------------------- | ------------------------ | ------------------------------------ | ------ |
| Check for updates   | Menu > Check for Updates | Dialog shows current version         | [ ]    |
| Download update     | If available             | Progress indicator shows             | [ ]    |
| Install and restart | Accept update            | App restarts, updated                | [ ]    |
| Skip version        | Skip update              | Preference saved, not prompted again | [ ]    |
| Remind later        | Postpone                 | Prompts again next check             | [ ]    |

#### Update Rollback Test

| Test                          | Steps                 | Expected Result      | Status |
| ----------------------------- | --------------------- | -------------------- | ------ |
| Update to new version         | Accept update         | Successfully updated | [ ]    |
| Uninstall problematic version | Remove app            | Removed cleanly      | [ ]    |
| Reinstall previous version    | Install older version | Runs correctly       | [ ]    |
| Restore data from backup      | Import backup         | Data restored        | [ ]    |

---

### Uninstallation Verification

Verify clean removal from system.

#### Uninstallation Steps

| Step | Action                              | Expected Result         | Status |
| ---- | ----------------------------------- | ----------------------- | ------ |
| 1    | Close application if running        | App not in process list | [ ]    |
| 2    | Run uninstaller (platform-specific) | Uninstaller launches    | [ ]    |
| 3    | Choose keep/remove user data        | Option presented        | [ ]    |
| 4    | Complete uninstallation             | Success message         | [ ]    |
| 5    | Verify removal                      | Checks below            |

#### Post-Uninstallation Verification

| Check                              | Windows | macOS | Linux | Status |
| ---------------------------------- | ------- | ----- | ----- | ------ |
| Application removed                | [ ]     | [ ]   | [ ]   |        |
| Desktop shortcut removed           | [ ]     | N/A   | [ ]   |        |
| Start Menu entry removed           | [ ]     | N/A   | [ ]   |        |
| User data removed (if selected)    | [ ]     | [ ]   | [ ]   |        |
| Registry entries cleaned (Windows) | [ ]     | N/A   | N/A   |        |
| User data preserved (if selected)  | [ ]     | [ ]   | [ ]   |        |

---

## Known Issues

### Issue Tracking Template

Use this template to document known issues for each release.

```markdown
### Issue #[NUMBER]: [Brief Title]

**Severity**: [Critical | High | Medium | Low]
**Component**: [Main Process | Renderer | IPC | Database | UI | Build | Other]
**Platform**: [All | Windows | macOS | Linux | Specific version]
**First Reported**: [Version number or date]

**Description**:
[Detailed description of the issue]

**Steps to Reproduce**:

1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happens]

**Workaround**:
[Steps to work around the issue, if any]

**Fix Status**:

- [ ] Identified
- [ ] In Progress
- [ ] Ready for Testing
- [ ] Fixed in [version]

**Notes**:
[Any additional context, screenshots, or links to related issues]
```

---

### Severity Classification

| Severity     | Definition                                                      | Response Time      | Release Blocking      |
| ------------ | --------------------------------------------------------------- | ------------------ | --------------------- |
| **Critical** | App crash, data loss, security vulnerability                    | Immediate          | Yes                   |
| **High**     | Major feature broken, significant performance degradation       | 24 hours           | Evaluate case-by-case |
| **Medium**   | Feature partially broken, UI glitches, minor performance issues | Next release cycle | No                    |
| **Low**      | Cosmetic issues, typos, edge cases                              | Backlog            | No                    |

---

### Known Issues List

#### Critical

| ID  | Issue | Platform | Workaround | Fix Target |
| --- | ----- | -------- | ---------- | ---------- |
|     |       |          |            |            |

#### High

| ID  | Issue | Platform | Workaround | Fix Target |
| --- | ----- | -------- | ---------- | ---------- |
|     |       |          |            |            |

#### Medium

| ID  | Issue | Platform | Workaround | Fix Target |
| --- | ----- | -------- | ---------- | ---------- |
|     |       |          |            |            |

#### Low

| ID  | Issue | Platform | Workaround | Fix Target |
| --- | ----- | -------- | ---------- | ---------- |
|     |       |          |            |            |

---

### Workaround Documentation

When documenting workarounds, include:

1. **When to Use**: Specific conditions triggering the issue
2. **Workaround Steps**: Numbered, clear instructions
3. **Limitations**: What the workaround cannot do
4. **Side Effects**: Any trade-offs from using the workaround
5. **Recovery Steps**: How to undo the workaround

#### Example Workaround

**Issue**: App fails to start on Windows when user path contains non-ASCII characters

**Workaround**:

1. Create a new folder at `C:\ClarityOKRData\`
2. Open Command Prompt as Administrator
3. Run: `setx CLARITYOKR_DATA_PATH "C:\ClarityOKRData" /M`
4. Restart computer
5. Launch ClarityOKR

**Limitations**: Data will be stored in the new location, not in user's home directory

**Side Effects**: All users on the computer share the same data location

**Recovery**: Remove the environment variable to return to default behavior

---

## Auto-Update Notes

### Update Mechanism Overview

ClarityOKR uses electron-updater for automatic updates. The system checks for updates periodically and downloads them in the background.

#### Update Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   App Launch    │────▶│  Check Server   │────▶│ Compare Version │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
                              ┌───────────────────────────┼───────────────────────────┐
                              │                           │                           │
                              ▼                           ▼                           ▼
                        ┌──────────┐              ┌──────────────┐             ┌──────────┐
                        │ Up to Date│              │ Update Available│          │  Error   │
                        │   [Done]  │              │               │          │  [Log]   │
                        └──────────┘              └───────────────┘          └──────────┘
                                                          │
                                                          ▼
                                              ┌─────────────────────┐
                                              │  Download Update    │
                                              │   (Background)      │
                                              └─────────────────────┘
                                                          │
                              ┌───────────────────────────┼───────────────────────────┐
                              │                           │                           │
                              ▼                           ▼                           ▼
                        ┌──────────┐              ┌──────────────┐             ┌──────────┐
                        │  Ready   │              │   Download   │            │ Download │
                        │ to Install│            │    Progress  │            │  Failed  │
                        └──────────┘              └──────────────┘            └──────────┘
                              │
                              ▼
                        ┌──────────┐
                        │  Install │
                        │ & Restart│
                        └──────────┘
```

#### Update Server Requirements

- Static file hosting (S3, GitHub Releases, etc.)
- HTTPS required for security
- YAML update manifest files
- Binary files with platform-specific naming

---

### Testing Update Flows

#### Test Case 1: Normal Update Flow

| Step | Action                                    | Expected Result             |
| ---- | ----------------------------------------- | --------------------------- |
| 1    | Install v1.0.0                            | App runs v1.0.0             |
| 2    | Publish v1.0.1 to update server           | Available for download      |
| 3    | Wait for auto-check (or trigger manually) | Update detected             |
| 4    | Accept update                             | Download begins             |
| 5    | Complete download                         | "Update ready" notification |
| 6    | Install and restart                       | App runs v1.0.1             |

#### Test Case 2: Update While Offline

| Step | Action                  | Expected Result          |
| ---- | ----------------------- | ------------------------ |
| 1    | Disconnect from network | No network access        |
| 2    | Trigger update check    | Error handled gracefully |
| 3    | Reconnect network       | Auto-check resumes       |
| 4    | Update check succeeds   | Update detected          |

#### Test Case 3: Large Update Download

| Step | Action                         | Expected Result                |
| ---- | ------------------------------ | ------------------------------ |
| 1    | Publish large update (50MB+)   | Available on server            |
| 2    | Start update download          | Progress shown                 |
| 3    | Interrupt network mid-download | Download pauses, resumes later |
| 4    | Complete download              | Install available              |

#### Test Case 4: Multiple Updates Available

| Step | Action                 | Expected Result              |
| ---- | ---------------------- | ---------------------------- |
| 1    | Install v1.0.0         | App runs v1.0.0              |
| 2    | Publish v1.0.1, v1.0.2 | Both available               |
| 3    | Trigger update check   | v1.0.2 detected (latest)     |
| 4    | Update to v1.0.2       | Skips v1.0.1, goes to latest |

#### Test Case 5: User Defers Update

| Step | Action                   | Expected Result        |
| ---- | ------------------------ | ---------------------- |
| 1    | Detect available update  | Notification shown     |
| 2    | Select "Remind me later" | Notification dismissed |
| 3    | Continue using app       | Normal operation       |
| 4    | Next scheduled check     | Prompted again         |

#### Test Case 6: Skip Version

| Step | Action                     | Expected Result                     |
| ---- | -------------------------- | ----------------------------------- |
| 1    | Detect v1.1.0 update       | Notification shown                  |
| 2    | Select "Skip this version" | Preference saved                    |
| 3    | Next check                 | v1.1.0 ignored unless newer version |

#### Test Case 7: Update Signature Verification

| Step | Action                  | Expected Result                       |
| ---- | ----------------------- | ------------------------------------- |
| 1    | Publish signed update   | Update on server                      |
| 2    | Attempt update          | Signature verified                    |
| 3    | Tamper with update file | Signature check fails, update blocked |

---

### Rollback Procedures

If a release has critical issues, follow these rollback procedures.

#### Immediate Mitigation (Prevent New Installs)

1. **Remove update from server**
   - Delete or move problematic release files
   - Update `latest.yml` to point to previous stable version
   - Clear CDN cache if applicable

2. **Communicate to users**
   - Post notice on website/status page
   - Send notification to active users (if notification system available)
   - Update release notes with warning

#### User Rollback Instructions

Provide these instructions to affected users:

**Windows:**

1. Uninstall current version via Settings > Apps
2. Download previous version from releases page
3. Install previous version
4. Restore data from backup if needed

**macOS:**

1. Move ClarityOKR.app to Trash
2. Download previous version DMG
3. Install to Applications folder
4. Restore data from backup if needed

**Linux:**

```bash
# For deb packages
sudo apt remove clarityokr
sudo dpkg -i clarityokr_[prev_version]_amd64.deb

# For AppImage
Replace AppImage file with previous version
```

#### Data Recovery

| Scenario                        | Recovery Steps                                 |
| ------------------------------- | ---------------------------------------------- |
| App launches but data corrupted | Restore from automatic backup: `data/backups/` |
| App won't launch                | Extract data.db from backup archive            |
| Complete data loss              | Contact support for manual recovery assistance |

#### Post-Rollback Checklist

| Item                                       | Status |
| ------------------------------------------ | ------ |
| Update server reverted to stable version   | [ ]    |
| CDN cache cleared                          | [ ]    |
| Status page updated                        | [ ]    |
| Support team notified                      | [ ]    |
| Post-mortem scheduled                      | [ ]    |
| Fix developed for problematic release      | [ ]    |
| New release tested thoroughly              | [ ]    |
| Incremented version number for new release | [ ]    |

---

## Appendix

### Quick Reference Commands

#### Build Commands

```bash
# Development build
pnpm run dev

# Production build
pnpm run build

# Platform-specific builds
pnpm run dist:mac
pnpm run dist:win
pnpm run dist:linux

# CI build
pnpm run build:ci
```

#### Test Commands

```bash
# All tests
pnpm run test

# Specific test suites
pnpm run test:unit
pnpm run test:component
pnpm run test:integration
pnpm run test:e2e
pnpm run test:performance
```

#### Verification Commands

```bash
# Type checking
pnpm run typecheck

# Linting
pnpm run lint

# Format checking
pnpm run format
```

### Release Files Checklist

Before publishing, verify these files exist:

| File               | Purpose                 | Required      |
| ------------------ | ----------------------- | ------------- |
| `CHANGELOG.md`     | Release notes           | Yes           |
| `README.md`        | Documentation           | Yes           |
| `LICENSE`          | License text            | Yes           |
| `package.json`     | Version and metadata    | Yes           |
| `latest-mac.yml`   | macOS update manifest   | Yes (macOS)   |
| `latest.yml`       | Windows update manifest | Yes (Windows) |
| `latest-linux.yml` | Linux update manifest   | Yes (Linux)   |

### Support Resources

| Resource      | Link/Location                                |
| ------------- | -------------------------------------------- |
| GitHub Issues | https://github.com/[org]/clarityokr/issues   |
| Documentation | https://docs.clarityokr.com                  |
| Release Notes | https://github.com/[org]/clarityokr/releases |
| Support Email | support@clarityokr.com                       |

---

## Document History

| Version | Date       | Author       | Changes                               |
| ------- | ---------- | ------------ | ------------------------------------- |
| 1.0     | 2026-04-08 | Release Team | Initial release testing documentation |

---

_End of Release Testing Documentation_
