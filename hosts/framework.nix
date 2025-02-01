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
            "RightAlt" = "Super_R";
            "RightCtrl" = "Alt_R";
            "LeftAlt" = "Super_L";
            "Super_L" = "LeftAlt";
          };
        }
      ];
    };
  };
}
