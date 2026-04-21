# Einstein for VS Code

Submit and test your DCU assignments via Einstein directly from VS Code — no Linux terminal required.

## How to Use

**1. Open the Einstein terminal**

Click the `+` dropdown in the VS Code terminal panel and select **Einstein**, or run `Einstein: Open Terminal` from the command palette (`Ctrl+Shift+P`).

**2. Set your credentials (first time only)**

```
einstein> set credentials
```

Enter your DCU username and password when prompted. They are stored securely and never asked again.

**3. Submit a file**

```
einstein> einstein task1.py
```

If this is your first submission in this workspace, you'll be asked for your module code (e.g. `ca116`, `csc1035`). It gets saved automatically so you won't be asked again.

**4. View your results**

```
──────────────────────────────────────────────────
einstein task1.py  (CSC1035)
Uploading…

  ✓  test 1    passed
  ✓  test 2    passed
  ✗  test 3    failed
  ✓  test 4    passed

3/4 tests passed  (1 failed)

https://csc1035.computing.dcu.ie/einstein/report.html
──────────────────────────────────────────────────
```

Click the report link to open the full results page in your browser.

## Commands

| Command | Description |
|---|---|
| `einstein <file>` | Submit a file |
| `einstein` | Submit the currently open file |
| `set module <code>` | Set your module code (e.g. `set module ca116`) |
| `set credentials` | Update your DCU username and password |
| `clear` | Clear the terminal |
| `help` | Show all commands |

All commands are typed directly into the Einstein terminal panel.

## Tab Completion

Press `Tab` while typing a filename to autocomplete it:

- **One match** — completes immediately
- **Multiple matches** — extends to the longest common prefix, press `Tab` again to list all options

## VS Code Command Palette

| Command | Description |
|---|---|
| `Einstein: Open Terminal` | Open the Einstein terminal |
| `Einstein: Set Credentials` | Update your DCU credentials |
| `Einstein: Clear Credentials` | Remove saved credentials |

## Settings

| Setting | Description |
|---|---|
| `einstein.defaultModule` | Your module code — set automatically on first use |

## Requirements

- VS Code 1.85 or later
- A DCU student account
- Internet connection

## Notes

- Your password is stored using VS Code's built-in secure secret storage — it is never saved in plain text
- Your module code is saved per workspace, so if you work on multiple modules each folder remembers its own
- Works on Windows, macOS, and Linux
