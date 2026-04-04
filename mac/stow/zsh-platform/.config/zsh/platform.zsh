# macOS zsh platform overrides

# Zsh plugins via Homebrew
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
source $(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac

# Worktree helpers (create WezTerm workspace + git worktree)
new() {
  local worktree_name="" cwd=~/work/fluid-mono-with-backend/fluid-mono.git default_branch=main

  while [[ $# -gt 0 ]]; do
    case $1 in
      -f|--frontend) cwd=~/work/fluid-mono-with-backend/fluid-mono.git; default_branch=main; shift ;;
      -b|--backend) cwd=~/work/fluid-mono-with-backend/fluid.git; default_branch=master; shift ;;
      --cwd) cwd="$2"; shift 2 ;;
      *) worktree_name="$1"; shift ;;
    esac
  done

  if [[ -z "$worktree_name" ]]; then
    echo "Usage: new <worktree-name> [-f|--frontend] [-b|--backend] [--cwd <dir>]"
    return 1
  fi

  builtin cd "$cwd/$default_branch" || { echo "Error: could not cd to $cwd/$default_branch"; return 1; }
  git checkout "$default_branch" || return 1
  git pull origin "$default_branch" || return 1
  builtin cd "$cwd" || return 1
  git worktree add "$worktree_name" || { echo "Error: could not create worktree '$worktree_name'"; return 1; }
  builtin cd "$worktree_name" || return 1
  git push -u || return 1
  echo "Created git worktree '$worktree_name'"
}

checkout() {
  local branch_name="" cwd=~/work/fluid-mono-with-backend/fluid-mono.git default_branch=main

  while [[ $# -gt 0 ]]; do
    case $1 in
      -f|--frontend) cwd=~/work/fluid-mono-with-backend/fluid-mono.git; default_branch=main; shift ;;
      -b|--backend) cwd=~/work/fluid-mono-with-backend/fluid.git; default_branch=master; shift ;;
      --cwd) cwd="$2"; shift 2 ;;
      *) branch_name="$1"; shift ;;
    esac
  done

  if [[ -z "$branch_name" ]]; then
    echo "Usage: checkout <branch-name> [-f|--frontend] [-b|--backend] [--cwd <dir>]"
    return 1
  fi

  builtin cd "$cwd/$default_branch" || { echo "Error: could not cd to $cwd/$default_branch"; return 1; }
  git fetch origin '+refs/heads/*:refs/remotes/origin/*' || return 1
  builtin cd "$cwd" || return 1
  git worktree add "$branch_name" "origin/$branch_name" || { echo "Error: could not create worktree '$branch_name'"; return 1; }
  builtin cd "$branch_name" || return 1
  git checkout -b "$branch_name" || return 1
  git branch -u "origin/$branch_name" || return 1
  echo "Created git worktree '$branch_name' tracking origin/$branch_name"
}

# SSH alias
alias mizu="ssh mizu@100.121.123.91"
