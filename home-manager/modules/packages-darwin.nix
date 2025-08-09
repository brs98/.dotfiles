{ pkgs, config, ... }: {
  home.packages = with pkgs; [
    # macOS-specific packages
    gnupg
    libyaml
    procps
    protobuf
    grpcurl
    grpcui
  ];
  
  home.sessionPath = [
    "/opt/homebrew/bin"
    "/opt/homebrew/opt/libpq/bin"
    "${config.home.homeDirectory}/personal/new-worktree"
  ];
}