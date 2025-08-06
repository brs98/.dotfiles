# Configuration Style and Conventions

## Nix Code Style
- Use proper Nix formatting with consistent indentation
- Organize imports with inputs at the top
- Use `let...in` blocks for local variables
- Prefer declarative configuration over imperative scripts
- Use meaningful variable names

## File Organization
- Platform-specific configurations in separate directories (`nix-darwin/`, `nixos/`)
- Shared user configurations in `home-manager/modules/`
- Application-specific configs in `home-manager/configs/`
- Reusable modules for common functionality

## Module Structure
- Each module should be self-contained
- Use proper module imports and exports
- Include comments for complex configurations
- Follow existing naming patterns

## Configuration Management
- Shell aliases go in `home-manager/modules/terminal.nix`
- Git configuration in `home-manager/modules/git.nix`
- Package definitions in respective `packages.nix` files
- System services in platform-specific service files

## Best Practices
- Test configurations before switching
- Use symlinks for config files that need to be edited externally
- Keep sensitive information in password store
- Document complex configurations
- Use platform-specific conditionals where needed