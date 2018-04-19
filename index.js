const path = require('path');
const webpack = require('webpack');
const RuleSet = require('webpack/lib/RuleSet');
const AliasPlugin = require('enhanced-resolve/lib/AliasPlugin');
const ModulesInRootPlugin = require('enhanced-resolve/lib/ModulesInRootPlugin');

function escapeForRegEx(str) {
  return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

// Join an array with environment agnostic path identifiers
function arrToPathForRegEx(arr) {
  return arr.map(function(x) {
    return escapeForRegEx(x);
  }).join('/');
}

const BUILD_PATH_PARTS = ['.meteor', 'local', 'build', 'programs', 'web.browser'];
const PACKAGES_PATH_PARTS = BUILD_PATH_PARTS.concat(['packages']);
const PACKAGES_REGEX = new RegExp(arrToPathForRegEx(PACKAGES_PATH_PARTS));
const PACKAGES_REGEX_NOT_MODULES = new RegExp(
  arrToPathForRegEx(PACKAGES_PATH_PARTS) +
  '\\/(?!modules\\.js)[^/\\\\]+$'
);
const PACKAGES_REGEX_MODULES = new RegExp(
  arrToPathForRegEx(PACKAGES_PATH_PARTS) +
  '\\/modules\\.js$'
);
const PACKAGES_REGEX_GLOBAL_IMPORTS = /\/global-imports\.js$/;

const PLUGIN_NAME = 'MeteorImportsWebpackPlugin';


class MeteorImportsPlugin {
  constructor(config) {
    config.exclude = [
      'autoupdate',
      'hot-code-push',
      'livedate',
      'ecmascript',
    ].concat(config.exclude || []);
    this.config = config;
  }

  apply(compiler) {
    this.setPaths(compiler);
    this.readPackages();
    compiler.hooks.compile.tap(PLUGIN_NAME, params => {
      this.addLoaders(params);
    });

    compiler.hooks.afterResolvers.tap(PLUGIN_NAME, compiler => {
      compiler.resolverFactory.hooks.resolver
        .for("normal")
        .tap(PLUGIN_NAME, resolver => {
          this.addAliases(resolver);
        });
    });
  }

  setPaths(compiler) {
    const context = compiler.context;

    this.meteorBuild = this.config.meteorProgramsFolder
      ? path.resolve(context, this.config.meteorProgramsFolder, 'web.browser')
      : path.resolve.apply(path, [context, this.config.meteorFolder].concat(BUILD_PATH_PARTS));

    this.meteorPackages = path.join(this.meteorBuild, 'packages');
  }

  readPackages() {
    let manifest;
    try {
      manifest = require(this.meteorBuild + '/program.json').manifest;
    } catch (e) {
      throw Error('Run Meteor at least once and wait for startup to complete.');
    }

    this.packages = manifest
      .filter(x => x.type === 'js' || x.type === 'css')
      .filter(x => x.path !== 'app/app.js')
      .filter(x => !this.config.exclude.includes(x))
      .filter(x => {
        const match = x.path.match(/(packages|app)\/(.+)\.[^.]+$/);
        if (!match) {
          console.error('Unexpected package path', x.path);
          return false;
        }
        return true;
      });
  }

  addAliases(resolver) {
    // Provide the alias "meteor-imports"
    new AliasPlugin('described-resolve', {
      name: 'meteor-imports',
      onlyModule: true,
      alias: path.join(__dirname, './meteor-imports-loader.js'),
    }, 'resolve').apply(resolver);

    // Provide aliases for all packages so that they can be imported
    for (let pkg of this.packages) {
      if (!pkg.path) continue; // can be just a source string
      new AliasPlugin('described-resolve', {
        name: 'meteor/' + pkg.name,
        onlyModule: true,
        alias: path.join(this.meteorBuild, pkg.path),
      }, 'resolve').apply(resolver);
    }
  }

  addLoaders(params) {
    const extraRules = [
      {
        meteorImports: true,
        test: /meteor-imports-loader\.js/,
        loader: path.join(__dirname, 'meteor-imports-loader.js'),
        options: {
          packages: this.packages,
          config: this.config
        }
      },
      {
        meteorImports: true,
        test: PACKAGES_REGEX_NOT_MODULES,
        loader: 'imports-loader?this=>window',
      },
      {
        meteorImports: true,
        test: PACKAGES_REGEX_MODULES,
        loader: path.join(__dirname, 'modules-loader.js')
      },
      {
        meteorImports: true,
        test: PACKAGES_REGEX_GLOBAL_IMPORTS,
        loader: path.join(__dirname, 'global-imports-loader.js'),
        options: this.config
      },
      {
        meteorImports: true,
        test: /\.css$/,
        include: [this.meteorPackages],
        use: [
          {loader: 'style-loader'},
          {loader: 'css-loader'}
        ]
      }
    ];
    const nmf = params.normalModuleFactory;
    nmf.ruleSet = new RuleSet(nmf.ruleSet.rules.concat(extraRules));
  }
}

module.exports = MeteorImportsPlugin;
