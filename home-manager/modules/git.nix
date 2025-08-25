{ pkgs, ... }: 
let
  # Get Git user info from environment variables with fallbacks
  gitUserName = "brs98";
  gitUserEmail = "southwick.brandon21@gmail.com";
in
{
    programs = {
      # Git configuration
      git = {
        enable = true;
        userName = if gitUserName != "" then gitUserName else "Your Name";
        userEmail = if gitUserEmail != "" then gitUserEmail else "your.email@example.com";
        aliases = {
          co = "checkout";
          br = "branch";
          st = "status";
          f = "fetch";
          a = "add";
          c = "commit";
          cm = "commit -m";
          p = "push";
        };
        extraConfig = {
          credential = {
            helper = if pkgs.stdenv.isDarwin then "osxkeychain" else "store";
          };
          core = {
            editor = "nvim";
            ignorecase = false;
          };
          pull = {
            rebase = true;
          };
          push = {
            autoSetupRemote = true;
          };
          init = {
            defaultBranch = "main";
          };
          rebase = {
            updateRefs = true;
          };
          delta = {
            navigate = true;
            side-by-side = true;
          };
        };
      };
      # gh configuration
      gh = {
        enable = true;
      };

      # lazygit configuration
      lazygit = {
        enable = true;
      };

      # delta configuration
      git.delta = {
        enable = true;
      };
};
}
