{ pkgs, ... }: {
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
    "/Users/brandon/personal/new-worktree"
  ];
}