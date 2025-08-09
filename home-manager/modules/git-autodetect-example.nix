# Example: Auto-detecting Git configuration
# This approach tries to get existing Git config or falls back to environment variables

{ pkgs, ... }: 
let
  # Try to get existing git config
  existingGitName = builtins.readFile (pkgs.runCommand "get-git-name" {} ''
    if command -v git >/dev/null 2>&1; then
      git config --global user.name 2>/dev/null || echo "Your Name"
    else
      echo "Your Name"
    fi > $out
  '');
  
  existingGitEmail = builtins.readFile (pkgs.runCommand "get-git-email" {} ''
    if command -v git >/dev/null 2>&1; then
      git config --global user.email 2>/dev/null || echo "your.email@example.com"
    else
      echo "your.email@example.com"
    fi > $out
  '');
  
  # Fallback to environment variables
  gitUserName = builtins.getEnv "GIT_USER_NAME";
  gitUserEmail = builtins.getEnv "GIT_USER_EMAIL";
  
  finalUserName = if gitUserName != "" then gitUserName else existingGitName;
  finalUserEmail = if gitUserEmail != "" then gitUserEmail else existingGitEmail;
in
{
  programs.git = {
    enable = true;
    userName = finalUserName;
    userEmail = finalUserEmail;
    # ... rest of git configuration
  };
}