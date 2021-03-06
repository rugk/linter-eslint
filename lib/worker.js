'use strict'
// Note: 'use babel' doesn't work in forked processes
process.title = 'linter-eslint helper'

const CP = require('childprocess-promise')
const Path = require('path')

const resolveEnv = require('resolve-env')
const Helpers = require('./es5-helpers')

const findEslintDir = Helpers.findEslintDir
const find = Helpers.find
const determineConfigFile = Helpers.determineConfigFile
const getEslintCli = Helpers.getEslintCli
const Communication = new CP()

// closed-over module-scope variables
let eslintPath = null
let eslint = null

Communication.on('JOB', function (job) {
  const params = job.Message
  const modulesPath = find(params.fileDir, 'node_modules')
  const eslintignoreDir = Path.dirname(find(params.fileDir, '.eslintignore'))
  // Check for config file
  const configFile = determineConfigFile(params)
  global.__LINTER_RESPONSE = []

  // Determine whether to bail out
  if (params.canDisable && configFile === null) {
    job.Response = []
    return
  }

  if (modulesPath) {
    process.env.NODE_PATH = modulesPath
  } else process.env.NODE_PATH = ''
  require('module').Module._initPaths()

  // Determine which eslint instance to use
  const eslintNewPath = findEslintDir(params)
  if (eslintNewPath !== eslintPath) {
    eslint = getEslintCli(eslintNewPath)
    eslintPath = eslintNewPath
  }

  job.Response = new Promise(function (resolve) {
    let filePath
    if (eslintignoreDir) {
      filePath = Path.relative(eslintignoreDir, params.filePath)
      process.chdir(eslintignoreDir)
    } else {
      filePath = Path.basename(params.filePath)
      process.chdir(params.fileDir)
    }
    const argv = [
      process.execPath,
      eslintPath,
      '--stdin',
      '--format',
      Path.join(__dirname, 'reporter.js')
    ]
    if (params.rulesDir) {
      let rulesDir = resolveEnv(params.rulesDir)
      if (!Path.isAbsolute(rulesDir)) {
        rulesDir = find(params.fileDir, rulesDir)
      }
      argv.push('--rulesdir', rulesDir)
    }
    if (typeof configFile === 'string') {
      argv.push('--config', resolveEnv(configFile))
    }
    if (params.disableIgnores) {
      argv.push('--no-ignore')
    }
    argv.push('--stdin-filename', filePath)
    process.argv = argv
    eslint.execute(process.argv, params.contents)
    resolve(global.__LINTER_RESPONSE)
  })
})

Communication.on('FIX', function (fixJob) {
  const params = fixJob.Message
  const modulesPath = find(params.fileDir, 'node_modules')
  const configFile = determineConfigFile(params)

  if (modulesPath) {
    process.env.NODE_PATH = modulesPath
  } else process.env.NODE_PATH = ''
  require('module').Module._initPaths()

  // Determine which eslint instance to use
  const eslintNewPath = findEslintDir(params)
  if (eslintNewPath !== eslintPath) {
    eslint = getEslintCli(eslintNewPath)
    eslintPath = eslintNewPath
  }

  const argv = [
    process.execPath,
    eslintPath,
    params.filePath,
    '--fix'
  ]

  if (typeof configFile === 'string') {
    argv.push('--config', resolveEnv(configFile))
  }

  fixJob.Response = new Promise(function (resolve, reject) {
    try {
      process.argv = argv
      eslint.execute(process.argv)
    } catch (err) {
      reject('Linter-ESLint: Fix Attempt Completed, Linting Errors Remain')
    }
    resolve('Linter-ESLint: Fix Complete')
  })
})

process.exit = function () { /* Stop eslint from closing the daemon */ }
