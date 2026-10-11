# AGENT WORKFLOW & COMMIT PROTOCOL

## Mandatory Visibility & Push Protocol Rule
For any agent working on this repository, **EVERY PUSH MUST BE MADE AFTER TEMPORARILY MAKING THE REPOSITORY PUBLIC AND THEN IMMEDIATELY RESTORING IT TO PRIVATE**.

### Authentication via Environment PAT
The GitHub Personal Access Token (PAT) is stored in `.env.local` as `GH_TOKEN` (or `GITHUB_TOKEN`). Before running visibility commands or git push operations, extract and load this token into the current shell session:

**In PowerShell:**
```powershell
$token = (Get-Content .env.local | Where-Object { $_ -match "^(GH_TOKEN|GITHUB_TOKEN)=" } | Select-Object -First 1) -replace '^[A-Z_]+=', ''
$env:GH_TOKEN = $token.Trim().Trim('"').Trim("'")
```

**In Bash / POSIX:**
```bash
export GH_TOKEN=$(grep -E '^(GH_TOKEN|GITHUB_TOKEN)=' .env.local | head -n 1 | cut -d '=' -f2- | tr -d '"'\'' ')
```

---

### Step-by-Step Execution Sequence

1. **Load `GH_TOKEN`** into the session environment from `.env.local` as shown above.
2. **Make the repository PUBLIC**:
   ```bash
   gh repo edit Hackers-lab/disconnection-management-new --visibility public --accept-visibility-change-consequences
   ```
3. **Commit and Push the code to `main`**:
   ```bash
   git add <modified_files>
   git commit -m "<descriptive commit message>"
   git push origin main
   ```
4. **IMMEDIATELY make the repository PRIVATE**:
   ```bash
   gh repo edit Hackers-lab/disconnection-management-new --visibility private --accept-visibility-change-consequences
   ```
5. **Verify Private Status**:
   ```bash
   gh repo view Hackers-lab/disconnection-management-new --json isPrivate
   ```
   Ensure `"isPrivate": true` is confirmed before concluding the task.

---

### Strict Security Rules
- **NEVER** commit `.env`, `.env.local`, `.har`, or credential files under any circumstances.
- Always check `git status` prior to staging files to verify that only intended application files are included.
- Visibility toggling to public must only persist for the duration of the push, followed immediately by setting visibility back to private.
