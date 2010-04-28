var sys    = require("sys"),
   colours = require("colours"),
   path    = require("path"),
   fs      = require("fs"),
   exec    = require("child_process").exec;

exports.commands = function commands () {
  return Object.keys(exports.commands);
};

/* Repository */
function Repository (project) {
  if (project.match(/^\w+:\/{2}/)) {
    this.url = project;
  } else if (project.match(/\//)) {
    this.url = "git://github.com/" + project;
  } else {
    this.url = "git://github.com/" + process.env["USER"] + "/" + project;
  };
};

Repository.fullpath = path.join(process.env.HOME, ".node_libraries");

Repository.chdir = function chdir () {
  process.chdir(this.fullpath);
};

Repository.prototype.__defineGetter__("basename", function () {
  var parts = this.url.split("/");
  var name = parts[parts.length - 1];
  if (name.match(/\.git$/)) {
    return name.substring(0, name.length - 3);
  } else {
    return name;
  };
});

Repository.prototype.__defineGetter__("fullpath", function () {
  return path.join(Repository.fullpath, this.basename);
});

Repository.prototype.clone = function clone (block) {
  Repository.chdir();
  run("git clone " + this.url, block);
};

Repository.prototype.chdir = function chdir () {
  process.chdir(this.fullpath);
};

Repository.prototype.update = function update () {
  this.chdir();
  run("git fetch && git rebase origin/master"); // TODO: not master, but the current branch
};

Repository.prototype.remove = function remove (block) {
  run("rm -rf " + this.fullpath, block);
};

/* helpers */
function run (command, callback) {
  sys.puts(command);
  exec(command, callback);
};

function chdir (path, block) {
  var originalPath = process.cwd();
  process.chdir(path);
  block(path);
  process.chdir(originalPath);
};

exports.warn = function warn (text) {
  sys.puts(colours.bold.yellow + text + colours.reset);
};

exports.suceed = function suceed (text) {
  sys.puts(colours.bold.green + text + colours.reset);
};

exports.fail = function fail (message, block) {
  sys.puts(colours.bold.red + message + colours.reset);
  if (block) { sys.puts(""); block() };
  process.exit(1);
};

exports.usage = function usage (title, text) {
  var title = title || "Usage";
  sys.puts(colours.bold.green + title + colours.reset);
  sys.puts(text);
};

exports.example = function example (text) {
  sys.puts(colours.bold.yellow + "Example" + colours.reset);
  sys.puts(text);
};

exports.help = function help (message) {
  exports.fail(message, function () {
    var text = "  - " + exports.commands().join("\n  - ");
    exports.usage("Available commands:", text);
  });
};

/* commands */
exports.commands.install = function install (args) {
  var project = args.shift();
  if (!project) {
    exports.fail("You have to provide arguments for install!", function () {
      exports.usage(null, "spm install [repo]\n");
      exports.example("spm install botanicus/minitest.js");
    });
  };

  var repo = new Repository(project);
  fs.stat(repo.fullpath, function (error, stats) {
    if (error) {
      repo.clone(function () {
        // warn if index.js doesn't exist
        fs.stat(repo.fullpath + "/index.js", function (error, stats) {
          if (error) {
            exports.warn("Project " + repo.basename + " doesn't have index.js");
            sys.puts("This isn't necessary a bad thing, you just can't require it via " + repo.basename);
          };
        });
      });
    } else {
      exports.fail("Project " + repo.basename + " is already installed.");
    };
  });
};

exports.commands.remove = function remove (args) {
  var project = args.shift();
  if (!project) {
    exports.fail("You have to provide arguments for remove!", function () {
      exports.usage(null, "spm remove [repo]\n");
      exports.example("spm remove minitest.js");
    });
  };

  var repo = new Repository(project);
  fs.stat(repo.fullpath, function (error, stats) {
    if (!error) {
      repo.remove(function (error) {
        if (!error) {
          exports.suceed("Library " + repo.basename + " have been removed.");
        } else {
          exports.fail("Error occured: " + error.stack);
        };
      });
    } else {
      exports.warn("Library " + repo.basename + " doesn't exist.");
    };
  });
};

exports.commands.uninstall = exports.commands.remove;

exports.commands.update = function update (args) {
  function updateRepository (repo) {
    sys.puts("Updating " + repo.basename);
    repo.update(function () {
      exports.suceed("Project " + repo.basename + " have been updated");
    });
  };

  var project = args.shift();
  if (project) {
    var repo = new Repository(project);
    fs.stat(repo.fullpath, function (error, stats) {
      if (!error) {
        updateRepository(repo);
      } else {
        exports.warn("Library " + repo.basename + " doesn't exist.");
      };
    });
  } else {
    fs.readdir(Repository.fullpath, function (error, paths) {
      if (!error || !paths.length === 0) {
        paths.forEach(function (path) {
          var repo = new Repository(require("path").basename(path));
          updateRepository(repo);
        });
      } else {
        exports.warn("You don't have any libraries installed!");
      };
    });
  };
};

exports.commands.list = function list () {
  fs.readdir(Repository.fullpath, function (error, files) {
    if (error || files.length == 0) {
      sys.puts("You don't have any libraries installed so far.");
    } else {
      sys.puts("- " + files.join("- \n"));
    };
  });
};

// /api/v1/json/search/node_js
// /api/v2/json/repos/search/nodejs
// http://develop.github.com/p/repo.html
exports.commands.search = function search (args) {
  var pattern = args.shift() || "node";
  var url = "http://github.com/api/v1/json/search/" + pattern;
  run("curl " + url, function (error, stdout, stderr) {
    sys.puts("");
    if (!error) {
      var data = JSON.parse(stdout);
      var repositories = data.repositories;
      repositories.forEach(function (repo) {
        var raw = JSON.stringify([repo.name, repo.description]);
        if (repo.language === "JavaScript") {
          if (!repo.fork) {
            exports.suceed(repo.username + "/" + repo.name);
          } else {
            exports.suceed(repo.username + "/" + repo.name + "(forked from " + "TODO" + ")");
          };

          if (process.argv.indexOf("--raw") === -1) {
            sys.puts(colours.yellow + repo.description + colours.reset);
            sys.puts("Followers: " + repo.followers)
            sys.puts("Forks: " + repo.forks)
            sys.puts("Created: " + repo.created)
            sys.puts("Last push: " + repo.pushed)
          } else {
            sys.p(repo);
          };

          sys.puts("");
        };
      });
    } else {
      exports.fail("API call failed.", function () {
        sys.puts(error.stack);
        exports.warn("\n" + "STDERR: ");
        sys.puts(stderr);
        exports.warn("\n" + "STDOUT: ");
        sys.puts(stdout);
      });
    };
  });
};
