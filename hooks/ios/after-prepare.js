'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const INHERITED_DEFINITON = '"$(inherited)"';
const WK_WEBVIEW_ENGINE_IS_USED = 'WK_WEBVIEW_ENGINE_IS_USED';
const WKWEBVIEW_PLUGIN_NAME = 'cordova-plugin-wkwebview-engine';

const readdir = promisify(fs.readdir);

const getProjectName = async ({ projectDir }) => {
    const files = await readdir(projectDir);

    const ext = '.xcodeproj';
    const xcodeproj = files.find(file => path.extname(file) === ext);
    if (!xcodeproj) {
        throw new Error(`Couldn't find xcode project ar ${projectDir}`);
    }

    return path.basename(xcodeproj, ext);
};

const getProject = ({ projectDir, projectName }) => {
    const { parse } = require(path.join(projectDir, '/cordova/lib/projectFile.js'));
    const pbxproj = path.join(projectDir, `${projectName}.xcodeproj`, 'project.pbxproj');
    return parse({ root: projectDir, pbxproj });
};

const isWKWebviewEngineUsed = async function(ctx) {
    const plugins = await ctx.cordova.projectMetadata.getPlugins(ctx.opts.projectRoot);
    return plugins.some(plugin => plugin.name === WKWEBVIEW_PLUGIN_NAME);
};

const getPreprocessorDefinitions = function(buildSettings) {
    const definitions = buildSettings.GCC_PREPROCESSOR_DEFINITIONS;
    if (!definitions) {
        return [];
    }

    if (typeof definitions === 'string') {
        return [definitions];
    }

    return definitions;
};

module.exports = async function(ctx) {
    console.log('Running CHCP "after-prepare" hook:');

    const projectDir = path.join(ctx.opts.projectRoot, 'platforms', 'ios');
    const projectName = await getProjectName({ projectDir });

    const project = await getProject({ projectDir, projectName });

    const { firstTarget } = project.xcode.getFirstTarget();
    const configurationLists = project.xcode.pbxXCConfigurationList();
    const buildConfigurationSections = project.xcode.pbxXCBuildConfigurationSection();
    const { buildConfigurations } = configurationLists[firstTarget.buildConfigurationList];

    const wkWebviewEngineIsUsed = `"${WK_WEBVIEW_ENGINE_IS_USED}=${Number(await isWKWebviewEngineUsed(ctx))}"`;
    for (const config of buildConfigurations) {
        const { buildSettings } = buildConfigurationSections[config.value];
        buildSettings.GCC_PREPROCESSOR_DEFINITIONS = getPreprocessorDefinitions(buildSettings)
            .filter(
                definition =>
                    definition !== INHERITED_DEFINITON &&
                    definition.includes(WK_WEBVIEW_ENGINE_IS_USED) === false
            )
            .concat([wkWebviewEngineIsUsed, INHERITED_DEFINITON]);
    }

    await project.write();

    console.log(`\tAdded preprocessor definition ${wkWebviewEngineIsUsed}`);
};
