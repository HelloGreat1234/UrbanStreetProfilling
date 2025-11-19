
# Urban Street Profiling — Quick Start

Minimal instructions to run the app on Windows (PowerShell).

Prerequisites
- Node.js & npm
- Python 3.8+

Start backend (from project root):
```powershell
# Change to the project root (replace with your path if needed)
cd <project-root>
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt  # or: pip install flask flask-cors psycopg2-binary
python database_connection.py
```

Start frontend:
```powershell
# From the project root:
cd frontend
npm install
npm start
```

Notes
- Backend serves at `http://localhost:5000`; frontend at `http://localhost:3000`.
- Ensure DB credentials (if used) are set in `database_connection.py` or via environment variables.
- Use `Apply Weights` in the UI to recompute scores after changing sliders.

That's all — this file only includes the essential start commands.

