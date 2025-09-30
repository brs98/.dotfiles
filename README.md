```bash
curl -L https://raw.githubusercontent.com/brs98/.dotfiles/main/install-mac.sh | bash
```

sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run nix-darwin/master#darwin-rebuild -- switch --flake ".#default"
