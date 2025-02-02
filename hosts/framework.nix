{ inputs, ... }: {

  imports = [
    ../nixos/framework-hardware-configuration.nix 
    inputs.xremap-flake.nixosModules.default
  ];

  services.xremap = {
    withHypr = true;
    userName = "brandon";
    config = {
      modmap = [
        { 
          name = "Global"; 
          remap = { 
            "Alt_R" = "Super_R";
            "Ctrl_R" = "Alt_R";
            "Alt_L" = "Super_L";
            "Super_L" = "Alt_L";
          };
        }
      ];
    };
  };
}
