{
  description = "Conference Bot";

  inputs = {
    utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "nixpkgs/nixos-23.05";
    devenv.url = "github:cachix/devenv/v0.6.3";
  };

  outputs = inputs @ { self, nixpkgs, utils, devenv }:
    utils.lib.eachDefaultSystem (system: let
      pkgs = nixpkgs.legacyPackages."${system}";
    in rec {
      # `nix develop`
      devShell = devenv.lib.mkShell {
        inherit inputs pkgs;
        modules = [
          {
            languages = {
              javascript.enable = true;
              typescript.enable = true;
            };

            env = {
              # Work around 'digital envelope routines::unsupported'
              # source: https://stackoverflow.com/a/75536711
              NODE_OPTIONS = "--openssl-legacy-provider";
            };

            packages = with pkgs; [
              yarn
              nodePackages.typescript-language-server
            ];
          }
        ];
      };
    });
}
