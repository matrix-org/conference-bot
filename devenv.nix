{ pkgs, lib, config, inputs, ... }:

{
  cachix.enable = false;

  languages = {
    javascript = {
      enable = true;
      yarn.enable = true;
    };
    typescript.enable = true;
  };

  env = {
    # Work around 'digital envelope routines::unsupported'
    # source: https://stackoverflow.com/a/75536711
    # TODO Not sure if still applicable
#     NODE_OPTIONS = "--openssl-legacy-provider";
  };

  packages = with pkgs; [
    # LSP for TypeScript
    vtsls
  ];

  # See full reference at https://devenv.sh/reference/options/
}

