import * as DialogPrimitive from '@afilmory/ui/dialog/radix'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { clearAdminToken, getAdminToken, setAdminToken } from '~/lib/photo-admin/github'
import type { RecategorizeResult, RecategorizeStep } from '~/lib/photo-admin/recategorize'
import { buildNewS3Key, getPhotoCategory, recategorizePhoto } from '~/lib/photo-admin/recategorize'

interface ManagePanelProps {
  currentPhoto: {
    s3Key?: string
  }
}

type ExecutionStatus = 'idle' | 'running' | 'done'

export const ManagePanel = ({ currentPhoto }: ManagePanelProps) => {
  const [searchParams] = useSearchParams()
  const isManageMode = searchParams.get('manage') === '1'

  const [token, setTokenState] = useState<string | null>(() => getAdminToken())
  const [tokenInput, setTokenInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle')
  const [result, setResult] = useState<RecategorizeResult | null>(null)

  const s3Key = currentPhoto.s3Key ?? ''
  const currentCategory = getPhotoCategory(s3Key)

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

  const closeConfirm = useCallback(() => {
    setConfirmOpen(false)
    setExecutionStatus('idle')
    setResult(null)
  }, [])

  const handleApply = useCallback(async () => {
    if (!token || !s3Key || !categoryInput.trim()) return
    setExecutionStatus('running')
    setResult(null)
    const recategorizeResult = await recategorizePhoto(token, s3Key, categoryInput)
    setResult(recategorizeResult)
    setExecutionStatus('done')
  }, [token, s3Key, categoryInput])

  if (!isManageMode) return null

  const isSameCategory = newS3KeyPreview !== null && newS3KeyPreview === s3Key

  return (
    <div className="border-accent/20 bg-accent/10 mt-3 rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-white/80">🛠 管理模式 · 分类整理</h4>
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
              disabled={!categoryInput.trim() || isSameCategory || executionStatus === 'running'}
              onClick={() => setConfirmOpen(true)}
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
      )}

      <DialogPrimitive.Root open={confirmOpen} onOpenChange={(open) => (open ? setConfirmOpen(true) : closeConfirm())}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-100000000 bg-black/70 backdrop-blur-sm" />
          <DialogPrimitive.Content className="border-accent/20 bg-material-thick fixed top-1/2 left-1/2 z-100000000 w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-4 text-white shadow-2xl">
            <DialogPrimitive.Title className="text-base font-semibold">确认移动照片分类？</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 space-y-2 text-sm text-white/80">
              <p>将执行以下操作：</p>
              <ul className="list-disc pl-4 text-xs text-white/60">
                <li>
                  <span>{`照片仓库：${s3Key} → ${newS3KeyPreview ?? ''}`}</span>
                </li>
                <li>主仓库：同步更新 photo-descriptions.json（若有该照片条目）</li>
                <li>旧链接将失效，且操作不可撤销</li>
              </ul>
              {executionStatus === 'done' && result ? <ResultView result={result} /> : null}
            </DialogPrimitive.Description>
            <div className="mt-4 flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="glassmorphic-btn rounded-md px-3 py-1 text-xs text-white/70"
                  disabled={executionStatus === 'running'}
                >
                  取消
                </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                onClick={handleApply}
                disabled={executionStatus === 'running'}
                className="bg-accent rounded-md px-3 py-1 text-xs text-white disabled:opacity-40"
              >
                {executionStatus === 'running' ? '执行中…' : '确认执行'}
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
  'move-photo': '写入新分类',
  'remove-photo': '删除旧分类文件',
  'update-descriptions': '更新描述文件',
}

const ResultView = ({ result }: { result: RecategorizeResult }) => (
  <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
    {result.ok ? (
      <p className="text-xs text-green-300">
        ✓ 已完成：{result.oldS3Key} → {result.newS3Key}
      </p>
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
