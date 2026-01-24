# CI/CD Pipeline Setup Guide for OnePen

This guide walks you through setting up a complete CI/CD (Continuous Integration/Continuous Deployment) pipeline for OnePen using GitHub Actions and Firebase Hosting.

---

## Table of Contents

1. [What is CI/CD?](#what-is-cicd)
2. [Project Structure Overview](#project-structure-overview)
3. [Understanding the Pipeline](#understanding-the-pipeline)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [Understanding the Tests](#understanding-the-tests)
6. [Firebase Setup](#firebase-setup)
7. [Running Locally](#running-locally)
8. [Troubleshooting](#troubleshooting)

---

## What is CI/CD?

### Continuous Integration (CI)
CI automatically runs tests and checks every time you push code. This catches bugs early before they reach production.

**Benefits:**
- Catches bugs early
- Ensures code quality
- Validates that new changes don't break existing functionality

### Continuous Deployment (CD)
CD automatically deploys your application when code passes all tests. No manual deployment needed!

**Benefits:**
- Faster releases
- Reduced human error
- Consistent deployment process

### Our Pipeline Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Push to   │────▶│  Run Tests  │────▶│  Deploy to  │
│   GitHub    │     │  (pytest)   │     │  Firebase   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  If tests   │
                    │  fail, STOP │
                    └─────────────┘
```

---

## Project Structure Overview

After setup, your project will have these new files:

```
OnePen/
├── .github/
│   └── workflows/
│       └── ci-cd.yml          # GitHub Actions workflow
├── tests/
│   ├── __init__.py            # Makes tests a Python package
│   ├── conftest.py            # Shared test fixtures
│   ├── test_preprocessor.py   # Tests for data preprocessing
│   └── test_config.py         # Tests for configuration
├── pytest.ini                 # Pytest configuration
└── docs/
    └── CICD_GUIDE.md          # This guide
```

---

## Understanding the Pipeline

### The Workflow File (`.github/workflows/ci-cd.yml`)

Let's break down each section:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]      # Runs when you push to main
  pull_request:
    branches: [main]      # Runs when you create a PR to main
```

**What this does:** Triggers the pipeline on pushes and pull requests to the `main` branch.

---

### Job 1: Test

```yaml
test:
  name: Test
  runs-on: ubuntu-latest    # Uses a Linux virtual machine

  steps:
    - name: Checkout code
      uses: actions/checkout@v4    # Downloads your code

    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.11'
        cache: 'pip'               # Caches dependencies for speed

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install pytest pytest-cov
        pip install pyyaml pydantic pydantic-settings numpy

    - name: Run tests with coverage
      run: |
        pytest tests/ -v --cov=src --cov-report=xml
```

**What this does:**
1. Spins up a fresh Linux machine
2. Downloads your code
3. Installs Python 3.11
4. Installs test dependencies
5. Runs all tests with coverage reporting

---

### Job 2: Deploy

```yaml
deploy:
  name: Deploy to Firebase
  needs: test                    # Only runs if tests pass!
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'

  steps:
    - name: Deploy to Firebase Hosting
      uses: FirebaseExtended/action-hosting-deploy@v0
      with:
        firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        projectId: ${{ secrets.FIREBASE_PROJECT_ID }}
```

**What this does:**
1. Waits for tests to pass (`needs: test`)
2. Only runs on pushes to main (not PRs)
3. Deploys the `app/` folder to Firebase Hosting

---

## Step-by-Step Setup

### Step 1: Get Firebase Service Account JSON

First, download your Firebase credentials:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (e.g., "OnePen")
3. Click the **gear icon ⚙️** next to "Project Overview" → **Project settings**
4. Click the **Service accounts** tab at the top
5. Scroll down and click **"Generate new private key"** button
6. Click **"Generate key"** in the popup
7. A JSON file will download (e.g., `onepen-firebase-adminsdk-xxxxx.json`)
8. **Keep this file safe** - you'll need it in the next step

**⚠️ Important:** Never commit this JSON file to your repository!

---

### Step 2: Find Your Firebase Project ID

While still in Firebase Console:

1. Go to **Project settings** (gear icon)
2. In the **General** tab, find **Project ID**
3. It looks like: `onepen-abc123` or `your-project-name`
4. **Copy this ID** - you'll need it in the next step

---

### Step 3: Add GitHub Repository Secrets

Now add the secrets to GitHub. **Use Repository secrets, NOT Environment secrets.**

#### Detailed Steps:

1. **Go to your GitHub repository** (e.g., `https://github.com/yourusername/OnePen`)

2. **Click "Settings"** tab (top right of the repo page)
   ```
   < > Code | Issues | Pull requests | Actions | Projects | Wiki | Security | Insights | ⚙️ Settings
   ```

3. **In the left sidebar**, scroll down to find **"Secrets and variables"**
   ```
   Security
   ├── Code security and analysis
   ├── Secrets and variables  ← Click this
   │   ├── Actions            ← Then click this
   │   ├── Codespaces
   │   ├── Dependabot
   │   └── Environments
   ```

4. **Click "Actions"** under "Secrets and variables"

5. You'll see a page with tabs: **"Secrets"** and "Variables"
   - Make sure you're on the **"Secrets"** tab

6. **Click "New repository secret"** button (green button)

   ```
   Repository secrets
   ┌─────────────────────────────────────────────────────┐
   │ Secrets are environment variables that are...       │
   │                                                     │
   │  [New repository secret]  ← Click this button       │
   └─────────────────────────────────────────────────────┘
   ```

7. **Add the first secret (FIREBASE_SERVICE_ACCOUNT):**
   - **Name:** `FIREBASE_SERVICE_ACCOUNT`
   - **Secret:** Open the downloaded JSON file in a text editor, copy ALL contents:
     ```json
     {
       "type": "service_account",
       "project_id": "your-project-id",
       "private_key_id": "...",
       "private_key": "-----BEGIN PRIVATE KEY-----\n...",
       ...
     }
     ```
   - Paste the entire JSON (including the curly braces) into the "Secret" field
   - Click **"Add secret"**

8. **Click "New repository secret"** again

9. **Add the second secret (FIREBASE_PROJECT_ID):**
   - **Name:** `FIREBASE_PROJECT_ID`
   - **Secret:** Your project ID (e.g., `onepen-abc123`)
   - Click **"Add secret"**

#### After Adding Both Secrets:

You should see:
```
Repository secrets (2)
┌────────────────────────────┬─────────────┐
│ Name                       │ Updated     │
├────────────────────────────┼─────────────┤
│ FIREBASE_SERVICE_ACCOUNT   │ just now    │
│ FIREBASE_PROJECT_ID        │ just now    │
└────────────────────────────┴─────────────┘
```

#### ❌ Common Mistakes to Avoid:

- **Don't use Environment secrets** - Use "Repository secrets" instead
- **Don't add quotes** around the project ID - just paste `onepen-abc123`, not `"onepen-abc123"`
- **Copy the ENTIRE JSON file** - including the opening `{` and closing `}`
- **Don't include the filename** - just the contents of the JSON file

---

### Step 4: Push Your Code

```bash
# Add all new files
git add .github/ tests/ pytest.ini docs/

# Commit
git commit -m "Add CI/CD pipeline with pytest and Firebase deploy"

# Push to main
git push origin main
```

---

### Step 5: Watch the Magic!

1. Go to your GitHub repository
2. Click the **Actions** tab
3. You'll see your workflow running!

---

## Understanding the Tests

### Test Structure

```python
# tests/test_preprocessor.py

class TestGetBoundingBox:
    """Tests for get_bounding_box function."""

    def test_simple_stroke(self, sample_stroke):
        """Test bounding box calculation for a simple stroke."""
        x_min, x_max, y_min, y_max = get_bounding_box(sample_stroke)

        assert x_min == 100    # Verify expected value
        assert x_max == 250
```

**Anatomy of a test:**
- `class TestXxx`: Groups related tests
- `def test_xxx`: Individual test function (must start with `test_`)
- `sample_stroke`: A fixture (predefined test data)
- `assert`: Checks if condition is true

### Fixtures (`conftest.py`)

Fixtures are reusable test data:

```python
@pytest.fixture
def sample_stroke():
    """Sample stroke data for testing."""
    return [
        {"x": 100, "y": 200, "p": 0.5},
        {"x": 150, "y": 250, "p": 0.7},
    ]
```

Use fixtures by adding them as function parameters:

```python
def test_something(self, sample_stroke):   # sample_stroke is injected automatically
    result = process(sample_stroke)
    assert result is not None
```

### What We Test

| Module | Tests |
|--------|-------|
| `preprocessor.py` | Bounding box calculation, stroke normalization, data filtering |
| `config.py` | Configuration loading, validation, property methods |

---

## Firebase Setup

### Prerequisites

1. Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```

2. Logged in to Firebase:
   ```bash
   firebase login
   ```

3. Initialized Firebase in your project:
   ```bash
   firebase init hosting
   ```

### Your `firebase.json`

```json
{
  "hosting": {
    "public": "app",           # Deploy the 'app' folder
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  }
}
```

---

## Running Locally

### Run Tests Locally

```bash
# Install test dependencies
pip install pytest pytest-cov pyyaml pydantic pydantic-settings numpy

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/test_preprocessor.py

# Run specific test class
pytest tests/test_preprocessor.py::TestGetBoundingBox

# Run specific test
pytest tests/test_preprocessor.py::TestGetBoundingBox::test_simple_stroke
```

### View Coverage Report

After running with `--cov-report=html`:
```bash
# Open the HTML report
start htmlcov/index.html   # Windows
open htmlcov/index.html    # Mac
```

---

## Troubleshooting

### Tests Fail in CI but Pass Locally

**Common causes:**
1. **Missing dependencies:** Add them to the workflow's pip install
2. **Path issues:** Use `sys.path.insert()` to add source directories
3. **Environment differences:** CI uses Linux, you might use Windows

### Firebase Deploy Fails

**Check:**
1. Service account has correct permissions
2. Project ID is correct
3. `firebase.json` exists and is valid

### "No module named 'modifiers'"

The tests add the source path automatically:
```python
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
```

---

## Quick Reference

### GitHub Actions Syntax

```yaml
name: Workflow Name           # Display name

on:                           # Triggers
  push:
    branches: [main]

jobs:
  job-name:                   # Job identifier
    runs-on: ubuntu-latest    # Virtual machine
    needs: [other-job]        # Dependencies
    if: condition             # Conditional execution

    steps:
      - name: Step name
        uses: action@version  # Use pre-built action
        with:                 # Action inputs
          key: value

      - name: Run command
        run: |                # Run shell commands
          echo "Hello"
          pytest tests/
```

### Pytest Syntax

```python
# Basic test
def test_something():
    assert 1 + 1 == 2

# Test with fixture
def test_with_fixture(sample_data):
    assert len(sample_data) > 0

# Test expecting exception
def test_error():
    with pytest.raises(ValueError):
        raise ValueError("error")

# Parametrized test
@pytest.mark.parametrize("input,expected", [(1, 2), (2, 4)])
def test_double(input, expected):
    assert input * 2 == expected
```

---

## Summary

You now have:

1. **Automated Testing:** Every push runs tests automatically
2. **Quality Assurance:** Code can't be deployed if tests fail
3. **Automatic Deployment:** Push to main = deploy to Firebase
4. **Coverage Tracking:** Know how much code is tested

This setup demonstrates professional software engineering practices that ML teams look for:
- Test-driven development
- Continuous integration
- Automated deployment
- Code quality assurance

---

## Next Steps

1. **Add more tests:** Cover edge cases, error handling
2. **Add linting:** Use `ruff` or `flake8` for code style
3. **Add type checking:** Use `mypy` for type safety
4. **Add model tests:** Test model loading and inference

Good luck with your ML intern applications! 🚀
