#!/usr/bin/env node
// Run the Control Center (app/) as a background app that starts at login.
//   macOS: a launchd agent (~/Library/LaunchAgents)   Linux: a systemd user service
//   Windows: hands over to scripts/control-center.ps1 (login task + supervisor)
//
//   node scripts/control-center.mjs <install|update|start|stop|restart|status|logs|open|uninstall>
//
//   install    npm ci + build, register the login service, start it
//   update     build into .next-staging while the app keeps running, swap it in, restart;
//              if the new build doesn't answer, the previous one is restored
//   status     is the service registered and is the app answering?
//   logs       last 60 lines of app/data/server.log
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { REPO, fail } from './lib/common.mjs'

const APP = path.join(REPO, 'app')
const DATA = path.join(APP, 'data')
const LOG = path.join(DATA, 'server.log')
const PORT = 3100
const URL = `http://127.0.0.1:${PORT}`
const LABEL = 'com.automation-workspace.control-center'
const UNIT = 'automation-control-center.service'
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const UNIT_FILE = path.join(os.homedir(), '.config', 'systemd', 'user', UNIT)

const say = (msg) => console.log(`${new Date().toISOString().slice(0, 19)} ${msg}`)
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`)
}
const quiet = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

async function up(timeoutS = 45) {
  for (let i = 0; i < timeoutS; i++) {
    try {
      const r = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(3000) })
      if (r.ok) return true
    } catch {
      /* not answering yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

// ---------------------------------------------------------------- service definitions

function nextBin() {
  return path.join(APP, 'node_modules', 'next', 'dist', 'bin', 'next')
}

function writeService() {
  fs.mkdirSync(DATA, { recursive: true })
  if (process.platform === 'darwin') {
    fs.mkdirSync(path.dirname(PLIST), { recursive: true })
    fs.writeFileSync(
      PLIST,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${nextBin()}</string>
    <string>start</string><string>-H</string><string>127.0.0.1</string><string>-p</string><string>${PORT}</string>
  </array>
  <key>WorkingDirectory</key><string>${APP}</string>
  <key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
`,
    )
  } else {
    fs.mkdirSync(path.dirname(UNIT_FILE), { recursive: true })
    fs.writeFileSync(
      UNIT_FILE,
      `[Unit]
Description=Automation Control Center (n8n workspace dashboard)
After=network.target

[Service]
WorkingDirectory=${APP}
Environment=NODE_ENV=production
ExecStart=${process.execPath} ${nextBin()} start -H 127.0.0.1 -p ${PORT}
Restart=always
RestartSec=3
StandardOutput=append:${LOG}
StandardError=append:${LOG}

[Install]
WantedBy=default.target
`,
    )
  }
}

const svc = {
  start() {
    if (process.platform === 'darwin') run('launchctl', ['load', '-w', PLIST])
    else run('systemctl', ['--user', 'start', UNIT])
  },
  stop() {
    if (process.platform === 'darwin') quiet('launchctl', ['unload', PLIST])
    else quiet('systemctl', ['--user', 'stop', UNIT])
  },
  restart() {
    if (process.platform === 'darwin') {
      if (!quiet('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${LABEL}`])) {
        this.stop()
        this.start()
      }
    } else run('systemctl', ['--user', 'restart', UNIT])
  },
  registered() {
    return process.platform === 'darwin' ? fs.existsSync(PLIST) : fs.existsSync(UNIT_FILE)
  },
}

// ---------------------------------------------------------------- commands

function build(distDir) {
  run(npm, ['run', 'build'], { cwd: APP, env: { ...process.env, NEXT_DIST_DIR: distDir } })
}

const commands = {
  async install() {
    say('Installing dependencies…')
    run(npm, ['ci'], { cwd: APP })
    say('Building…')
    build('.next')
    writeService()
    if (process.platform !== 'darwin') {
      run('systemctl', ['--user', 'daemon-reload'])
      run('systemctl', ['--user', 'enable', UNIT])
      say('Tip: run "loginctl enable-linger $USER" once so it also runs while you are logged out.')
    }
    svc.stop()
    svc.start()
    say((await up()) ? `Running at ${URL}` : 'Started, but not answering yet. See: node scripts/control-center.mjs logs')
  },

  async update() {
    const staging = path.join(APP, '.next-staging')
    const live = path.join(APP, '.next')
    const old = path.join(APP, '.next-old')
    say('Installing dependencies…')
    run(npm, ['ci'], { cwd: APP })
    say('Building the new version (the current one keeps running)…')
    fs.rmSync(staging, { recursive: true, force: true })
    try {
      build('.next-staging')
    } catch {
      fs.rmSync(staging, { recursive: true, force: true })
      fail('Build failed. Nothing changed; the current version is still running.')
    }
    say('Build OK. Switching to the new version…')
    svc.stop()
    fs.rmSync(old, { recursive: true, force: true })
    if (fs.existsSync(live)) fs.renameSync(live, old)
    fs.renameSync(staging, live)
    svc.start()
    if (await up()) {
      fs.rmSync(old, { recursive: true, force: true })
      say(`Update complete. Running at ${URL}`)
    } else {
      say('The new version is not answering. Rolling back…')
      svc.stop()
      fs.rmSync(live, { recursive: true, force: true })
      if (fs.existsSync(old)) fs.renameSync(old, live)
      svc.start()
      fail((await up()) ? 'Rolled back to the previous version.' : 'Rolled back, but the app is still not answering. See the logs.')
    }
  },

  async start() {
    if (!svc.registered()) fail('Not installed yet. Run: node scripts/control-center.mjs install')
    svc.start()
    say((await up()) ? `Running at ${URL}` : 'Started, but not answering yet.')
  },
  async stop() {
    svc.stop()
    say('Stopped.')
  },
  async restart() {
    svc.restart()
    say((await up()) ? `Running at ${URL}` : 'Restarted, but not answering yet.')
  },
  async status() {
    console.log(`Service registered: ${svc.registered() ? 'yes' : 'no'}`)
    console.log(`Answering at ${URL}: ${(await up(1)) ? 'yes' : 'no'}`)
  },
  async logs() {
    const text = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '(no log yet)'
    console.log(text.split(/\r?\n/).slice(-60).join('\n'))
  },
  async open() {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'
    quiet(opener, [URL])
  },
  async uninstall() {
    svc.stop()
    if (process.platform === 'darwin') fs.rmSync(PLIST, { force: true })
    else {
      quiet('systemctl', ['--user', 'disable', UNIT])
      fs.rmSync(UNIT_FILE, { force: true })
      quiet('systemctl', ['--user', 'daemon-reload'])
    }
    say('Service removed. The app files and data are kept.')
  },
}

const action = process.argv[2] || 'status'
if (process.platform === 'win32') {
  // Windows keeps the PowerShell supervisor (login task, in-app restart/update).
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(REPO, 'scripts', 'control-center.ps1'), action], { stdio: 'inherit' })
} else if (!commands[action]) {
  fail(`Unknown action "${action}". Use: ${Object.keys(commands).join(', ')}`)
} else {
  await commands[action]()
}
