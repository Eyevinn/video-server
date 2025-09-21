# Contributing to Open Video Server

Thank you for your interest in contributing to Open Video Server! We welcome contributions from the community and are pleased to have you join us.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- **Be respectful**: Treat everyone with respect and kindness
- **Be inclusive**: Welcome newcomers and help them succeed
- **Be collaborative**: Work together constructively
- **Be patient**: Help others learn and grow
- **Focus on what's best for the community**

## Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **FFmpeg** with SRT support
- **Git** for version control
- Basic understanding of JavaScript/Node.js

### First Time Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/open-video-server.git
   cd open-video-server
   ```
3. **Add the upstream repository**:
   ```bash
   git remote add upstream https://github.com/your-org/open-video-server.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Verify the setup**:
   ```bash
   npm start
   ```

## How to Contribute

### Types of Contributions

We welcome many types of contributions:

- 🐛 **Bug fixes**
- ✨ **New features**
- 📖 **Documentation improvements**
- 🧪 **Tests**
- 🎨 **UI/UX improvements**
- 🔧 **Performance optimizations**
- 🌐 **Translations** (future)

### Before You Start

1. **Check existing issues** to see if your idea is already being worked on
2. **Create an issue** to discuss your proposed changes
3. **Wait for feedback** before starting significant work
4. **Keep changes focused** - one feature/fix per pull request

## Development Setup

### Environment Setup

1. **Copy environment template**:
   ```bash
   cp .env.example .env
   ```

2. **Configure your environment**:
   ```bash
   # Required: FFmpeg path
   FFMPEG_PATH=/usr/local/bin/ffmpeg
   
   # Optional: Enable features for testing
   SRT_ENABLED=true
   THUMBNAIL_ENABLED=true
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

### Project Structure

```
open-video-server/
├── src/
│   ├── server.js          # Main server entry point
│   ├── api.js             # REST API endpoints
│   ├── config.js          # Configuration management
│   ├── streamer.js        # Core streaming logic
│   ├── srt-bridge.js      # SRT output bridge
│   ├── rtmp-bridge.js     # RTMP output bridge
│   └── thumbnail-bridge.js # Thumbnail generation
├── public/
│   └── index.html         # Web interface
├── tests/
│   └── ...                # Test files
└── docs/
    └── ...                # Documentation
```

## Coding Standards

### JavaScript Style

We use ESLint and Prettier for code formatting:

```bash
# Check code style
npm run lint

# Auto-fix formatting
npm run format
```

### Code Guidelines

- **Use clear, descriptive variable names**
- **Write comments for complex logic**
- **Keep functions small and focused**
- **Use async/await over callbacks**
- **Handle errors gracefully**
- **Follow existing patterns in the codebase**

### Example Code Style

```javascript
// Good: Clear function with error handling
async function startStreamingBridge(config) {
  try {
    const bridge = new StreamingBridge(config);
    await bridge.initialize();
    return bridge;
  } catch (error) {
    console.error('Failed to start streaming bridge:', error);
    throw new Error(`Bridge startup failed: ${error.message}`);
  }
}

// Good: Descriptive variable names
const thumbnailGenerationInterval = 5000;
const maxRetryAttempts = 3;
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- **Write tests for new features**
- **Update tests for changed functionality**
- **Use descriptive test names**
- **Test both success and error cases**

Example test structure:

```javascript
describe('StreamingBridge', () => {
  describe('initialization', () => {
    it('should start successfully with valid config', async () => {
      // Test implementation
    });

    it('should throw error with invalid config', async () => {
      // Test implementation
    });
  });
});
```

## Pull Request Process

### Before Submitting

1. **Sync with upstream**:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
4. **Test thoroughly**
5. **Update documentation** if needed

### Pull Request Guidelines

1. **Use a clear title** that describes the change
2. **Fill out the PR template** completely
3. **Link related issues** using "Fixes #123" or "Closes #123"
4. **Include screenshots** for UI changes
5. **Keep the scope focused** - one feature per PR

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] No breaking changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

### Review Process

1. **Automated checks** must pass (CI/CD)
2. **Code review** by maintainers
3. **Testing** in various environments
4. **Documentation** review if applicable
5. **Approval** and merge

## Issue Reporting

### Bug Reports

When reporting bugs, please include:

- **Clear title** describing the issue
- **Steps to reproduce** the problem
- **Expected vs actual behavior**
- **Environment details** (OS, Node.js version, FFmpeg version)
- **Log output** if available
- **Screenshots/videos** if applicable

### Feature Requests

For feature requests, please include:

- **Clear description** of the feature
- **Use case** and motivation
- **Proposed implementation** (if you have ideas)
- **Alternatives considered**

### Issue Labels

We use these labels to organize issues:

- `bug` - Something isn't working
- `feature` - New feature request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `priority: high/medium/low` - Issue priority

## Community

### Communication Channels

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - General questions and ideas
- **Pull Requests** - Code contributions

### Getting Help

- **Documentation** - Check README and docs first
- **Search Issues** - Your question might be answered already
- **Ask Questions** - Use GitHub Discussions for general questions
- **Be Patient** - Maintainers are volunteers

### Recognition

Contributors are recognized in:

- **CONTRIBUTORS.md** file
- **Release notes** for significant contributions
- **Special thanks** in project announcements

## Development Tips

### Debugging

- Use `console.log` strategically for debugging
- Check FFmpeg logs with `FFMPEG_LOG_LEVEL=info`
- Test with different video sources
- Monitor system resources during streaming

### Performance Testing

- Test with various video formats and bitrates
- Monitor CPU and memory usage
- Test network resilience (packet loss, latency)
- Verify thumbnail generation performance

### Documentation

- Update README for user-facing changes
- Add JSDoc comments for new functions
- Update API documentation for endpoint changes
- Include configuration examples

## Thank You!

Your contributions make Open Video Server better for everyone. Whether you're fixing bugs, adding features, improving documentation, or helping other users, your efforts are appreciated!

---

For questions about contributing, please open a GitHub Discussion or contact the maintainers.