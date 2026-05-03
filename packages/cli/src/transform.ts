import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import type {
  File,
  JSXElement,
  JSXOpeningElement,
  Node,
  VariableDeclarator,
} from '@babel/types'
import { shortHash, slugify } from './hash.js'
import type { AdaptiveKitConfig, ManifestEntry } from './types.js'

const traverse: typeof _traverse = (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse

export type TransformResult = {
  code: string
  entries: ManifestEntry[]
  preExistingIds: string[]
}

type Edit = {
  start: number
  end: number
  replacement: string
}

function getOpeningTagName(opening: JSXOpeningElement): string | null {
  const name = opening.name
  if (name.type === 'JSXIdentifier') return name.name
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`
  }
  if (name.type === 'JSXMemberExpression') {
    const parts: string[] = [name.property.name]
    let obj: JSXOpeningElement['name'] = name.object
    while (obj.type === 'JSXMemberExpression') {
      parts.unshift(obj.property.name)
      obj = obj.object
    }
    if (obj.type === 'JSXIdentifier') {
      parts.unshift(obj.name)
    }
    return parts.join('.')
  }
  return null
}

function existingAttributeValue(opening: JSXOpeningElement, attribute: string): string | null {
  for (const attr of opening.attributes) {
    if (attr.type !== 'JSXAttribute') continue
    if (attr.name.type !== 'JSXIdentifier') continue
    if (attr.name.name !== attribute) continue
    if (attr.value && attr.value.type === 'StringLiteral') return attr.value.value
    return ''
  }
  return null
}

function isContainerElement(el: JSXElement, elementTypes: Set<string>, componentTags: Set<string>): boolean {
  const tag = getOpeningTagName(el.openingElement)
  if (!tag) return false
  if (elementTypes.has(tag)) return true
  if (componentTags.has(tag)) return true
  return false
}

function findEnclosingComponentName(path: NodePath<JSXElement>): string | null {
  let cur: NodePath<Node> | null = path.parentPath
  while (cur) {
    const node = cur.node
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      return node.id.name
    }
    if (
      (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'ClassExpression') &&
      cur.parentPath?.node.type === 'VariableDeclarator'
    ) {
      const vd = cur.parentPath.node as VariableDeclarator
      if (vd.id.type === 'Identifier') return vd.id.name
    }
    if (node.type === 'ClassDeclaration' && node.id?.name) {
      return node.id.name
    }
    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration
      if (decl.type === 'FunctionDeclaration' && decl.id?.name) return decl.id.name
      if (decl.type === 'ClassDeclaration' && decl.id?.name) return decl.id.name
    }
    cur = cur.parentPath
  }
  return null
}

function fallbackComponentName(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? 'Component'
  const noExt = base.replace(/\.(t|j)sx?$/i, '')
  return noExt || 'Component'
}

function buildBlockId(
  componentName: string,
  filePath: string,
  elementType: string,
  occurrence: number,
): string {
  const slug = slugify(componentName)
  const tagSlug = slugify(elementType.replace('.', '-'))
  const base = slug ? `${slug}-${tagSlug}` : tagSlug
  const hash = shortHash(`${filePath}::${componentName}::${elementType}::${occurrence}`)
  return `ak-${base}-${hash}`
}

function computeInsertionOffset(opening: JSXOpeningElement, source: string): number | null {
  const name = opening.name
  if (!name.loc) return null
  const lines = source.split('\n')
  let offset = 0
  for (let i = 0; i < name.loc.end.line - 1; i++) {
    offset += (lines[i]?.length ?? 0) + 1
  }
  offset += name.loc.end.column
  return offset
}

export function transform(
  source: string,
  filePath: string,
  config: AdaptiveKitConfig,
): TransformResult {
  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'decorators-legacy',
        'objectRestSpread',
        'topLevelAwait',
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Parse failed for ${filePath}: ${message}`)
  }

  const elementTypes = new Set(config.elementTypes)
  const componentTags = new Set(config.componentTags)
  const entries: ManifestEntry[] = []
  const preExistingIds: string[] = []
  const edits: Edit[] = []
  const occurrenceCounters = new Map<string, number>()

  const depthStack: number[] = [0]

  traverse(ast, {
    JSXElement: {
      enter(path) {
        const depth = depthStack[depthStack.length - 1] ?? 0
        depthStack.push(depth + 1)

        const el = path.node
        const opening = el.openingElement
        const tag = getOpeningTagName(opening)
        if (!tag) return

        const existing = existingAttributeValue(opening, config.attribute)
        if (existing !== null) {
          if (existing) preExistingIds.push(existing)
          const componentName = findEnclosingComponentName(path) ?? fallbackComponentName(filePath)
          if (existing) {
            entries.push({
              id: existing,
              filePath,
              componentName,
              elementType: tag,
              depth,
              loc: opening.loc
                ? { line: opening.loc.start.line, column: opening.loc.start.column }
                : { line: 0, column: 0 },
            })
          }
          return
        }

        if (!isContainerElement(el, elementTypes, componentTags)) return
        if (depth < config.minDepth || depth > config.maxDepth) return
        if (opening.selfClosing && el.children.length === 0) return

        const componentName = findEnclosingComponentName(path) ?? fallbackComponentName(filePath)
        const counterKey = `${componentName}::${tag}`
        const occurrence = occurrenceCounters.get(counterKey) ?? 0
        occurrenceCounters.set(counterKey, occurrence + 1)

        const id = buildBlockId(componentName, filePath, tag, occurrence)
        const insertionOffset = computeInsertionOffset(opening, source)
        if (insertionOffset == null) return

        const replacement = ` ${config.attribute}="${id}"`
        edits.push({ start: insertionOffset, end: insertionOffset, replacement })

        entries.push({
          id,
          filePath,
          componentName,
          elementType: tag,
          depth,
          loc: opening.loc
            ? { line: opening.loc.start.line, column: opening.loc.start.column }
            : { line: 0, column: 0 },
        })
      },
      exit() {
        depthStack.pop()
      },
    },
  })

  edits.sort((a, b) => b.start - a.start)
  let code = source
  for (const edit of edits) {
    code = code.slice(0, edit.start) + edit.replacement + code.slice(edit.end)
  }

  return { code, entries, preExistingIds }
}

export function stripAttributes(source: string, attribute: string): { code: string; removed: number } {
  let ast: File
  try {
    ast = parse(source, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy', 'objectRestSpread'],
    })
  } catch {
    return { code: source, removed: 0 }
  }

  const edits: Edit[] = []

  traverse(ast, {
    JSXOpeningElement(path) {
      const opening = path.node
      for (let i = 0; i < opening.attributes.length; i++) {
        const attr = opening.attributes[i]
        if (!attr || attr.type !== 'JSXAttribute') continue
        if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== attribute) continue
        if (!attr.start || !attr.end) continue
        let start = attr.start
        let end = attr.end
        while (start > 0 && /\s/.test(source[start - 1] ?? '')) start--
        edits.push({ start, end, replacement: '' })
      }
    },
  })

  edits.sort((a, b) => b.start - a.start)
  let code = source
  for (const edit of edits) {
    code = code.slice(0, edit.start) + code.slice(edit.end)
  }

  return { code, removed: edits.length }
}

export const _internal = {
  buildBlockId,
  fallbackComponentName,
  getOpeningTagName,
}
