# Contributing to KLEats Backend

Thanks for your interest in contributing! We welcome contributions from everyone, whether it’s fixing bugs, adding features, improving documentation, or suggesting ideas.

## How to Contribute

### 1. Fork the Repository
- Fork this repo on GitHub.
- Clone your fork locally:
  ```powershell
  git clone https://github.com/your-username/KLEats-Backend.git
  cd KLEats-Backend
  ```

### 2. Create a Branch
- Create a new branch for your feature/fix:
  ```powershell
  git checkout -b feature/my-feature
  ```

### 3. Make Your Changes
- Follow the existing project structure.
- Keep your code clean and modular.
- Add/update tests where applicable.

### 4. Commit Your Changes
- Use clear commit messages:
  ```powershell
  git commit -m "fix(auth): resolve token expiry issue"
  git commit -m "feat(order): add cancel order endpoint"
  ```
- **Commit Message Convention:**
  - `feat:` → new feature
  - `fix:` → bug fix
  - `docs:` → documentation update
  - `chore:` → maintenance tasks
  - `refactor:` → code changes without new features

### 5. Push to Your Fork
  ```powershell
  git push origin feature/my-feature
  ```

### 6. Open a Pull Request (PR)
- Go to the original repo: KLEats Backend
- Open a PR against `main` branch
- Describe your changes clearly

## PR Checklist
Before submitting, make sure:
- Code compiles without errors
- Linting & formatting are clean (`npm run lint`)
- Tests (if applicable) are added/updated and passing
- Documentation (`README.md`, comments) is updated if needed

## Development Setup
### Requirements
- Node.js >= 16
- MySQL
- Redis

### Setup
- Install dependencies:
  ```powershell
  npm install
  ```
- Copy `.env.example` → `.env` and configure values.
- Start development server:
  ```powershell
  npm run dev
  ```

## Guidelines
- Write clear, maintainable code.
- Follow existing patterns (controllers, services, routers).
- Avoid committing secrets or `.env` files.
- Respect others’ work and keep PRs focused.

## Communication
- Open a GitHub Issue for bugs, questions, or feature requests.
- For discussions, use the repo’s Discussions tab (if enabled).

## Recognition
All contributors will be listed in the Contributors section of the README. Thank you for making KLEats better!
