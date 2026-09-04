import * as DialogPrimitive from '@afilmory/ui/dialog/radix'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { clearAdminToken, getAdminToken, setAdminToken } from '~/lib/photo-admin/github'
import type { RecategorizeResult, RecategorizeStep } from '~/lib/photo-admin/recategorize'
import {
  buildNewS3Key,
  buildRenamedS3Key,
  deletePhoto,
  getPhotoCategory,
  recategorizePhoto,
  renamePhoto,
  updatePhotoDescriptions,
} from '~/lib/photo-admin/recategorize'

interface ManagePanelProps {
  currentPhoto: {
    s3Key?: string
    title?: string
    descriptions?: Record<string, string>
  }
}

type ExecutionStatus = 'idle' | 'running' | 'done'
type ManageAction = 'move' | 'rename' | 'describe' | 'delete'

export const ManagePanel = ({ currentPhoto }: ManagePanelProps) => {
  const [searchParams] = useSearchParams()
  const isManageMode = searchParams.get('manage') === '1'

  const [token, setTokenState] = useState<string | null>(() => getAdminToken())
  const [tokenInput, setTokenInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [renameInput, setRenameInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [zhInput, setZhInput] = useState('')
  const [enInput, setEnInput] = useState('')
  const [action, setAction] = useState<ManageAction | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle')
  const [result, setResult] = useState<RecategorizeResult | null>(null)

  const s3Key = currentPhoto.s3Key ?? ''
  const currentCategory = getPhotoCategory(s3Key)
  const fileName =
    s3Key
      .split('/')
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, '') ?? ''
  const normalizeForCompare = (value: string) => value.replaceAll(' ', '').replaceAll('_', '').toLowerCase()
  const titleLooksLikeFileName =
    fileName.length > 0 && normalizeForCompare(currentPhoto.title ?? '') === normalizeForCompare(fileName)
  const effectiveTitle = titleLooksLikeFileName ? '' : (currentPhoto.title ?? '')

  useEffect(() => {
    setTitleInput(effectiveTitle)
    setZhInput(currentPhoto.descriptions?.['zh-CN'] ?? '')
    setEnInput(currentPhoto.descriptions?.en ?? '')
  }, [currentPhoto, effectiveTitle])

  const saveToken = useCallback(() => {
    if (!tokenInput.trim()) return
    setAdminToken(tokenInput)
    setTokenState(getAdminToken())
    setTokenInput('')
  }, [tokenInput])

  const clearToken = useCallback(() => {
    clearAdminToken()
    setTokenState(null)
  }, [])

  const newS3KeyPreview = useMemo(() => {
    if (!categoryInput.trim() || !s3Key) return null
    try {
      return buildNewS3Key(s3Key, categoryInput)
    } catch {
      return null
    }
  }, [categoryInput, s3Key])

  const renamedS3KeyPreview = useMemo(() => {
    if (!renameInput.trim() || !s3Key) return null
    try {
      return buildRenamedS3Key(s3Key, renameInput)
    } catch {
      return null
    }
  }, [renameInput, s3Key])

  const hasDescriptionChanges =
    titleInput.trim() !== effectiveTitle ||
    zhInput.trim() !== (currentPhoto.descriptions?.['zh-CN'] ?? '') ||
    enInput.trim() !== (currentPhoto.descriptions?.en ?? '')

  const openConfirm = useCallback((nextAction: ManageAction) => {
    setAction(nextAction)
    setConfirmOpen(true)
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirmOpen(false)
    setExecutionStatus('idle')
    setResult(null)
    setAction(null)
  }, [])

  const handleApply = useCallback(async () => {
    if (!s3Key || !action) return
    setExecutionStatus('running')
    setResult(null)
    if (!token) {
      setResult({
        ok: false,
        oldS3Key: s3Key,
        newS3Key: s3Key,
        steps: [],
        error: '请先粘贴并保存 GitHub Token',
      })
      setExecutionStatus('done')
      return
    }
    let recategorizeResult: RecategorizeResult
    try {
      switch (action) {
      case 'move': {
        recategorizeResult = await recategorizePhoto(token, s3Key, categoryInput)
      
      break;
      }
      case 'rename': {
        recategorizeResult = await renamePhoto(token, s3Key, renameInput)
      
      break;
      }
      case 'delete': {
        recategorizeResult = await deletePhoto(token, s3Key)
      
      break;
      }
      default: {
        recategorizeResult = await updatePhotoDescriptions(token, s3Key, {
          title: titleInput,
          zhCN: zhInput,
          en: enInput,
        })
      }
      }
    } catch (error) {
      recategorizeResult = {
        ok: false,
        oldS3Key: s3Key,
        newS3Key: s3Key,
        steps: [],
        error: error instanceof Error ? error.message : '执行失败',
      }
    }
    setResult(recategorizeResult)
    setExecutionStatus('done')
  }, [token, s3Key, action, categoryInput, renameInput, titleInput, zhInput, enInput])

  if (!isManageMode) return null

  const isSameCategory = newS3KeyPreview !== null && newS3KeyPreview === s3Key
  const isSameFileName = renamedS3KeyPreview !== null && renamedS3KeyPreview === s3Key
  const isRunning = executionStatus === 'running'

  return (
    <div className="border-accent/20 bg-accent/10 mt-3 rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-white/80">🛠 管理模式</h4>
        {token ? (
          <button type="button" className="text-xs text-white/50 duration-200 hover:text-white/80" onClick={clearToken}>
            清除 Token
          </button>
        ) : null}
      </div>

      {!token ? (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-white/60">
            需要 GitHub Token（fine-grained PAT，给这两个仓库的 Contents read/write 权限）。
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
              className="ml-1 underline"
            >
              去生成
            </a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="github_pat_...（仅保存在本浏览器）"
              className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/25 px-2 py-1 text-xs text-white placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={saveToken}
              disabled={!tokenInput.trim()}
              className="glassmorphic-btn rounded-md px-3 py-1 text-xs text-white disabled:opacity-40"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 分类整理 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span className="text-white/50">当前分类：</span>
              <span className="border-accent/20 bg-accent/10 rounded-full border px-2 py-0.5">
                {currentCategory ?? '无'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={categoryInput}
                onChange={(event) => setCategoryInput(event.target.value)}
                placeholder="输入新分类，如：风景"
                className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/25 px-2 py-1 text-xs text-white placeholder:text-white/30"
              />
              <button
                type="button"
                disabled={!categoryInput.trim() || isSameCategory || isRunning}
                onClick={() => openConfirm('move')}
                className="glassmorphic-btn rounded-md px-3 py-1 text-xs text-white disabled:opacity-40"
              >
                应用
              </button>
            </div>
            {newS3KeyPreview && newS3KeyPreview !== s3Key ? (
              <p className="text-xs text-white/60">
                移动：<span className="text-white/80">{s3Key}</span> →{' '}
                <span className="text-white/80">{newS3KeyPreview}</span>
              </p>
            ) : null}
          </div>

          {/* 重命名文件 */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="text-xs text-white/50">重命名文件（真实文件名，改后 URL 变化）</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={renameInput}
                onChange={(event) => setRenameInput(event.target.value)}
                placeholder="输入新文件名，如：狗（可带或不带扩展名）"
                className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/25 px-2 py-1 text-xs text-white placeholder:text-white/30"
              />
              <button
                type="button"
                disabled={!renameInput.trim() || isSameFileName || isRunning}
                onClick={() => openConfirm('rename')}
                className="glassmorphic-btn rounded-md px-3 py-1 text-xs text-white disabled:opacity-40"
              >
                重命名
              </button>
            </div>
            {renamedS3KeyPreview && renamedS3KeyPreview !== s3Key ? (
              <p className="text-xs text-white/60">
                重命名：<span className="text-white/80">{s3Key}</span> →{' '}
                <span className="text-white/80">{renamedS3KeyPreview}</span>
              </p>
            ) : null}
          </div>

          {/* 编辑标题与描述 */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="text-xs text-white/50">标题与描述（仅页面显示，不改文件名）</div>
            <input
              type="text"
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              placeholder="标题，如：草地上的狗"
              className="w-full rounded-md border border-white/20 bg-black/25 px-2 py-1 text-xs text-white placeholder:text-white/30"
            />
            <textarea
              value={zhInput}
              onChange={(event) => setZhInput(event.target.value)}
              placeholder="中文描述"
              rows={2}
              className="w-full resize-y rounded-md border border-white/20 bg-black/25 px-2 py-1 text-xs text-white placeholder:text-white/30"
            />
            <textarea
              value={enInput}
              onChange={(event) => setEnInput(event.target.value)}
              placeholder="English description"
              rows={2}
              className="w-full resize-y rounded-md border border-white/20 bg-black/25 px-2 py-1 text-xs text-white placeholder:text-white/30"
            />
            <button
              type="button"
              disabled={!hasDescriptionChanges || isRunning}
              onClick={() => openConfirm('describe')}
              className="glassmorphic-btn rounded-md px-3 py-1 text-xs text-white disabled:opacity-40"
            >
              保存标题与描述
            </button>
          </div>

          {/* 危险操作：删除照片（从私人照片仓库永久删除） */}
          <div className="space-y-2 border-t border-red-500/20 pt-3">
            <div className="text-xs text-red-400/90">删除照片（从私人照片仓库永久删除，不可恢复）</div>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => openConfirm('delete')}
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40"
            >
              删除该照片
            </button>
          </div>
        </div>
      )}

      <DialogPrimitive.Root open={confirmOpen} onOpenChange={(open) => (open ? setConfirmOpen(true) : closeConfirm())}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-100000000 bg-black/70 backdrop-blur-sm" />
          <DialogPrimitive.Content className="border-accent/20 bg-material-thick fixed top-1/2 left-1/2 z-100000000 w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-4 text-white shadow-2xl">
            <DialogPrimitive.Title className="text-base font-semibold">
              {action === 'move'
                ? '确认移动照片分类？'
                : action === 'rename'
                  ? '确认重命名照片文件？'
                  : action === 'delete'
                    ? '确认删除照片？'
                    : '确认更新标题与描述？'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 space-y-2 text-sm text-white/80">
              <p>将执行以下操作：</p>
              <ul className="list-disc pl-4 text-xs text-white/60">
                {action === 'move' ? (
                  <>
                    <li>
                      <span>{`照片仓库：${s3Key} → ${newS3KeyPreview ?? ''}`}</span>
                    </li>
                    <li>主仓库：同步更新 photo-descriptions.json（若有该照片条目）</li>
                    <li>旧链接将失效，且操作不可撤销</li>
                  </>
                ) : null}
                {action === 'rename' ? (
                  <>
                    <li>
                      <span>{`照片仓库：${s3Key} → ${renamedS3KeyPreview ?? ''}`}</span>
                    </li>
                    <li>主仓库：同步更新 photo-descriptions.json 中的 key 与标题</li>
                    <li>旧链接将失效，且操作不可撤销</li>
                  </>
                ) : null}
                {action === 'delete' ? (
                  <>
                    <li>
                      <span>
                        {'照片仓库：永久删除 '}
                        {s3Key}
                      </span>
                    </li>
                    <li>主仓库：移除 photo-descriptions.json 中对应条目（若有）</li>
                    <li>照片与缩略图将一并移除，旧链接失效且不可恢复</li>
                  </>
                ) : null}
                {action === 'describe' ? (
                  <>
                    <li>主仓库：更新 photo-descriptions.json 的标题与中文/英文描述</li>
                    <li>不移动或重命名文件，照片 URL 不变</li>
                  </>
                ) : null}
              </ul>
              {executionStatus === 'done' && result ? <ResultView result={result} /> : null}
            </DialogPrimitive.Description>
            <div className="mt-4 flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="glassmorphic-btn rounded-md px-3 py-1 text-xs text-white/70"
                  disabled={isRunning}
                >
                  取消
                </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                onClick={executionStatus === 'done' ? closeConfirm : handleApply}
                disabled={isRunning}
                className="bg-accent rounded-md px-3 py-1 text-xs text-white disabled:opacity-40"
              >
                {isRunning ? '执行中…' : executionStatus === 'done' ? '关闭' : '确认执行'}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}

const STEP_LABELS: Record<RecategorizeStep['step'], string> = {
  'read-photo': '读取照片文件',
  'move-photo': '写入新路径',
  'remove-photo': '删除旧文件',
  'delete-photo': '删除照片文件',
  'update-descriptions': '更新描述文件',
}

const ResultView = ({ result }: { result: RecategorizeResult }) => (
  <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
    {result.ok ? (
      <p className="text-xs text-green-300">✓ {result.message ?? `已完成：${result.oldS3Key} → ${result.newS3Key}`}</p>
    ) : (
      <p className="text-xs text-red-300">✗ 失败：{result.error}</p>
    )}
    <ul className="mt-1 space-y-0.5 text-xs text-white/60">
      {result.steps.map((step) => (
        <li key={step.step}>
          <span>
            {`${STEP_LABELS[step.step]}：${step.status === 'ok' ? '成功' : step.status === 'skipped' ? '跳过' : '失败'}`}
          </span>
          {step.detail ? <span>（{step.detail}）</span> : null}
        </li>
      ))}
    </ul>
  </div>
)
