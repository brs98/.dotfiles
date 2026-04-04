# Linux zsh platform overrides

# Zsh plugins from system packages
source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# xdg-open wrapper (macOS has native `open`)
open() {
  xdg-open "$@" >/dev/null 2>&1 &
}
