{ pkgs, ... }: {
    programs = {
      # Git configuration
      git = {
        enable = true;
        userName = "brs98";
        userEmail = "southwick.brandon21@gmail.com";
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
