{ pkgs, ... }: {
  channel = "stable-24.11";

  packages = [
    pkgs.nodejs_20
    pkgs.zulu
  ];

  env = {};

  services.firebase.emulators = {
    detect = false;
    projectId = "demo-app";
    services = [ "auth" "firestore" ];
  };

  idx = {
    extensions = [
      # "vscodevim.vim"
    ];

    workspace = {
      onCreate = {
        default.openFiles = [ "src/app/page.tsx" ];
        npm-install = "npm install";
      };
      onStart = {
        # watch-backend = "npm run watch-backend";
      };
    };

    previews = {
      enable = true;
      previews = {
        web = {
          command = [ "sh" "-c" "npm run dev" ];
          manager = "web";
          env = {
            PORT = "$PORT";
          };
        };
      };
    };
  };
}
