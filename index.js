#! /usr/bin/env node

const fs = require('fs')
const path = require('path')

async function* walk(dir) {
  for await (const d of await fs.promises.opendir(dir)) {
    const entry = path.join(dir, d.name)

    if (d.isDirectory()) {
      yield* walk(entry)
    } else if (d.isFile()) {
      yield entry
    }
  }
}

function resolveImportPath(sourceFile, importPath, options) {
  const sourceFileAbs = path.resolve(process.cwd(), sourceFile)
  const root = path.dirname(sourceFileAbs)

  const { moduleFilter = defaultModuleFilter } = options

  if (moduleFilter(importPath)) {
    const importPathAbs = path.resolve(root, importPath)

    let possiblePath = [
      path.resolve(importPathAbs, './index.ts'),
      path.resolve(importPathAbs, './index.js'),
      importPathAbs + '.ts',
      importPathAbs + '.js',
    ]

    if (possiblePath.length) {
      for (let i = 0; i < possiblePath.length; i++) {
        let entry = possiblePath[i]

        if (fs.existsSync(entry)) {
          const resolved = path.relative(root, entry.replace(/\.ts$/, '.js'))

          if (!resolved.startsWith('.')) {
            return './' + resolved
          }

          return resolved
        }
      }
    }
  }

  return null
}

function replace(filePath, outFilePath, options) {
  const code = fs.readFileSync(filePath).toString()
  const newCode = code.replace(
    /(import|export) (.+?) from ('[^\n']+'|"[^\n"]+");/gs,
    function (found, action, imported, from) {
      const importPath = from.slice(1, -1)
      const resolvedPath = resolveImportPath(filePath, importPath, options)

      if (resolvedPath) {
        return `${action} ${imported} from '${resolvedPath}';`
      }

      return found
    },
  )

  if (code !== newCode) {
    fs.writeFileSync(outFilePath, newCode)
  }
}

async function run(srcDir, options = defaultOptions) {
  const { sourceFileFilter = defaultSourceFileFilter } = options

  for await (const entry of walk(srcDir)) {
    if (sourceFileFilter(entry)) {
      replace(entry, entry, options)
    }
  }
}

function defaultSourceFileFilter(sourceFilePath) {
  return (
    /\.(js|ts)$/.test(sourceFilePath) && !/node_modules/.test(sourceFilePath)
  )
}

function defaultModuleFilter(importedModule) {
  return (
    !path.isAbsolute(importedModule) &&
    !importedModule.startsWith('@') &&
    !importedModule.endsWith('.js')
  )
}

const defaultOptions = {
  sourceFileFilter: defaultSourceFileFilter,
  moduleFilter: defaultModuleFilter,
}

const entryPath = process.argv[2]

if (!entryPath) {
  throw new Error('path argument is not found')
}

run(entryPath, defaultOptions)
