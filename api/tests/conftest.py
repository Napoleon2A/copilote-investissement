"""
Pytest config — ajoute le dossier api/ au sys.path pour que `import app.*` marche
quel que soit l'endroit d'où on lance pytest.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
