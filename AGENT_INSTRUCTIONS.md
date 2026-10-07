# AGENT WORKFLOW & COMMIT PROTOCOL

## Visibility & Push Protocol Rule
For any agent working on this repository, whenever code changes are committed and pushed, or when deployment triggers require temporary public exposure:

### Important Note on Visibility Toggling
- If visibility toggling (`public` -> `push` -> `private`) is configured:
  1. A GitHub CLI (`gh`) login with admin/repo scope or a GitHub Personal Access Token (PAT) with `repo` admin permissions (`GH_TOKEN`) is required to change repository visibility via `gh repo edit --visibility <public|private>`.
  2. If `gh` is authenticated, toggle repo visibility to **public**:
     ```bash
     gh repo edit Hackers-lab/disconnection-management-new --visibility public --accept-visibility-change-consequences
     ```
  3. Commit and push the code:
     ```bash
     git add <files>
     git commit -m "<message>"
     git push origin main
     ```
  4. Immediately toggle repo visibility back to **private**:
     ```bash
     gh repo edit Hackers-lab/disconnection-management-new --visibility private --accept-visibility-change-consequences
     ```
  5. If `gh` is not authenticated or lacks admin permissions, proceed with standard authenticated `git push` directly while keeping repository secrets and environment variables protected.

### Security Reminders
- Never commit `.env`, `.env.local`, `.har` or secrets.
- Always ensure `.gitignore` rules are respected before pushing.
