{ pkgs, lib, config, inputs, ... }:

{
  cachix.enable = false;

  languages = {
    javascript = {
      enable = true;
      # Use pnpm as a package manager
      # Notable constraint: it does the right thing with git+https dependencies
      # whereas yarn converts them to SSH fetch, even if you're not
      # set up to authenticate with SSH.
      pnpm.enable = true;

      # Needed in order to build the bot SDK, but don't use it for the confbot repo!
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

