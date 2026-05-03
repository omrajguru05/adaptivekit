import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transform, stripAttributes } from '../src/transform.js'
import { DEFAULT_CONFIG, mergeConfig } from '../src/config.js'

const cfg = mergeConfig(DEFAULT_CONFIG, { minDepth: 0 })

describe('transform()', () => {
  it('injects data-ak-id on a single div', () => {
    const src = `export function Card() {
  return <div className="card">hi</div>
}
`
    const { code, entries } = transform(src, 'src/Card.tsx', cfg)
    assert.ok(code.includes('data-ak-id="ak-card-div-'), code)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.componentName, 'Card')
    assert.equal(entries[0]?.elementType, 'div')
  })

  it('injects different IDs for sibling divs', () => {
    const src = `export function Page() {
  return (
    <main>
      <section>a</section>
      <section>b</section>
    </main>
  )
}
`
    const { entries } = transform(src, 'src/Page.tsx', cfg)
    const sections = entries.filter((e) => e.elementType === 'section')
    assert.equal(sections.length, 2)
    assert.notEqual(sections[0]?.id, sections[1]?.id)
  })

  it('skips elements that already have the attribute and re-imports their id', () => {
    const src = `export function Card() {
  return <div data-ak-id="ak-existing-1234">hi</div>
}
`
    const { code, entries, preExistingIds } = transform(src, 'src/Card.tsx', cfg)
    assert.equal(code, src)
    assert.equal(preExistingIds[0], 'ak-existing-1234')
    assert.equal(entries[0]?.id, 'ak-existing-1234')
  })

  it('does not modify custom (PascalCase) components by default', () => {
    const src = `export function Page() {
  return <Card>hi</Card>
}
`
    const { code, entries } = transform(src, 'src/Page.tsx', cfg)
    assert.equal(code, src)
    assert.equal(entries.length, 0)
  })

  it('opts custom components in via componentTags', () => {
    const src = `export function Page() {
  return <Card>hi</Card>
}
`
    const c = mergeConfig(DEFAULT_CONFIG, { minDepth: 0, componentTags: ['Card'] })
    const { code, entries } = transform(src, 'src/Page.tsx', c)
    assert.ok(code.includes('data-ak-id'))
    assert.equal(entries[0]?.elementType, 'Card')
  })

  it('respects minDepth/maxDepth bounds', () => {
    const src = `export function Page() {
  return (
    <div>
      <section>
        <article>deep</article>
      </section>
    </div>
  )
}
`
    const c = mergeConfig(DEFAULT_CONFIG, { minDepth: 1, maxDepth: 1 })
    const { entries } = transform(src, 'src/Page.tsx', c)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.elementType, 'section')
  })

  it('produces stable IDs across runs', () => {
    const src = `export function Card() {
  return <div className="x">hi</div>
}
`
    const a = transform(src, 'src/Card.tsx', cfg)
    const b = transform(src, 'src/Card.tsx', cfg)
    assert.equal(a.entries[0]?.id, b.entries[0]?.id)
  })

  it('preserves existing attributes and formatting', () => {
    const src = `export function Card() {
  return (
    <div className="card" id="root">
      <p>hi</p>
    </div>
  )
}
`
    const { code } = transform(src, 'src/Card.tsx', cfg)
    assert.ok(code.includes('className="card"'))
    assert.ok(code.includes('id="root"'))
    assert.ok(code.includes('data-ak-id'))
  })

  it('roundtrips with stripAttributes', () => {
    const src = `export function Card() {
  return <div className="card">hi</div>
}
`
    const { code } = transform(src, 'src/Card.tsx', cfg)
    assert.notEqual(code, src)
    const { code: stripped } = stripAttributes(code, cfg.attribute)
    assert.equal(stripped.replace(/\s+/g, ' '), src.replace(/\s+/g, ' '))
  })

  it('handles arrow function components', () => {
    const src = `export const Sidebar = () => <aside>nav</aside>
`
    const { entries } = transform(src, 'src/Sidebar.tsx', cfg)
    assert.equal(entries[0]?.componentName, 'Sidebar')
  })

  it('handles TypeScript syntax', () => {
    const src = `interface Props { title: string }
export function Card({ title }: Props): JSX.Element {
  return <section>{title}</section>
}
`
    const { entries } = transform(src, 'src/Card.tsx', cfg)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.elementType, 'section')
  })

  it('skips self-closing void containers', () => {
    const src = `export function Page() {
  return <div />
}
`
    const { entries } = transform(src, 'src/Page.tsx', cfg)
    assert.equal(entries.length, 0)
  })
})
