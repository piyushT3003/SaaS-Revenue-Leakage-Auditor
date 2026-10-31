import uvicorn
import os
import sys

# Ensure backend directory is in pythonpath
sys.path.insert(0, os.path.abspath("."))

if __name__ == "__main__":
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
