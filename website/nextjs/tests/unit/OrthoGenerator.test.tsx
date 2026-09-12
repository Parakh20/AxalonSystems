import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { OrthoGenerator } from '@/components/Platform/OrthoGenerator'
import { api, ApiError } from '@/lib/api'
import type { OdmJob } from '@/lib/odm'

const CONFIGURED = { status: 'ok', capabilities: { odm: { configured: true, message: null } } }

const job = (overrides: Partial<OdmJob> = {}): OdmJob => ({
  job_id: 'odm-abc',
  park_id: 'P1',
  state: 'running',
  progress: 0.3,
  stage: 'Processing on NodeODM (27%)',
  error: null,
  message: null,
  ortho_name: null,
  ...overrides,
})

beforeEach(() => {
  vi.spyOn(api, 'orthoGenerationJobs').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('OrthoGenerator', () => {
  test('is disabled with the backend explanation when ODM is not configured', async () => {
    vi.spyOn(api, 'health').mockResolvedValue({
      status: 'ok',
      capabilities: { odm: { configured: false, message: 'Set AXALON_NODEODM_URL' } },
    })
    render(<OrthoGenerator parkId="P1" onOrthoReady={vi.fn()} />)

    const button = await screen.findByRole('button', { name: /generate orthomosaic/i })
    await waitFor(() => expect(button).toBeDisabled())
    expect(screen.getByText(/Set AXALON_NODEODM_URL/)).toBeInTheDocument()
  })

  test('validates the zip before uploading', async () => {
    vi.spyOn(api, 'health').mockResolvedValue(CONFIGURED)
    const generate = vi.spyOn(api, 'generateOrtho')
    render(<OrthoGenerator parkId="P1" onOrthoReady={vi.fn()} />)

    const open = await screen.findByRole('button', { name: /generate orthomosaic/i })
    await waitFor(() => expect(open).toBeEnabled())
    fireEvent.click(open)
    const input = screen.getByLabelText(/images zip/i)
    fireEvent.change(input, { target: { files: [new File(['x'], 'flight.tar')] } })
    fireEvent.click(screen.getByRole('button', { name: /^start/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/\.zip/)
    expect(generate).not.toHaveBeenCalled()
  })

  test('uploads, shows progress, and reports completion', async () => {
    vi.spyOn(api, 'health').mockResolvedValue(CONFIGURED)
    const generate = vi.spyOn(api, 'generateOrtho').mockResolvedValue(job({ state: 'queued', progress: 0 }))
    vi.spyOn(api, 'orthoGenerationStatus')
      .mockResolvedValueOnce(job())
      .mockResolvedValue(job({ state: 'succeeded', progress: 1, ortho_name: 'odm_abc.tif' }))
    const onReady = vi.fn()
    render(<OrthoGenerator parkId="P1" onOrthoReady={onReady} pollMs={10} />)

    const open = await screen.findByRole('button', { name: /generate orthomosaic/i })
    await waitFor(() => expect(open).toBeEnabled())
    fireEvent.click(open)
    fireEvent.change(screen.getByLabelText(/images zip/i), {
      target: { files: [new File(['zip'], 'flight.zip')] },
    })
    fireEvent.click(screen.getByRole('button', { name: /^start/i }))

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    const form = generate.mock.calls[0][1] as FormData
    expect((form.get('images') as File).name).toBe('flight.zip')
    expect(form.get('sensor')).toBe('auto')

    await waitFor(() => expect(onReady).toHaveBeenCalledWith('odm_abc.tif'))
    expect(screen.getByText(/completed/i)).toBeInTheDocument()
  })

  test('shows the active job with a working cancel button', async () => {
    vi.spyOn(api, 'health').mockResolvedValue(CONFIGURED)
    vi.mocked(api.orthoGenerationJobs).mockResolvedValue([job()])
    vi.spyOn(api, 'orthoGenerationStatus').mockResolvedValue(job())
    const cancel = vi
      .spyOn(api, 'cancelOrthoGeneration')
      .mockResolvedValue(job({ state: 'cancelled' }))
    render(<OrthoGenerator parkId="P1" onOrthoReady={vi.fn()} pollMs={60_000} />)

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByText(/Processing on NodeODM/)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    })
    expect(cancel).toHaveBeenCalledWith('P1', 'odm-abc')
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument()
  })

  test('surfaces a failed job error', async () => {
    vi.spyOn(api, 'health').mockResolvedValue(CONFIGURED)
    vi.mocked(api.orthoGenerationJobs).mockResolvedValue([
      job({ state: 'failed', error: 'NodeODM task failed: Not enough overlap' }),
    ])
    render(<OrthoGenerator parkId="P1" onOrthoReady={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Not enough overlap/)
  })

  test('shows upload errors from the API', async () => {
    vi.spyOn(api, 'health').mockResolvedValue(CONFIGURED)
    vi.spyOn(api, 'generateOrtho').mockRejectedValue(
      new ApiError(400, '{"detail":"ZIP holds 2 images"}', 'ZIP holds 2 images'),
    )
    render(<OrthoGenerator parkId="P1" onOrthoReady={vi.fn()} />)
    const open = await screen.findByRole('button', { name: /generate orthomosaic/i })
    await waitFor(() => expect(open).toBeEnabled())
    fireEvent.click(open)
    fireEvent.change(screen.getByLabelText(/images zip/i), {
      target: { files: [new File(['zip'], 'flight.zip')] },
    })
    fireEvent.click(screen.getByRole('button', { name: /^start/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ZIP holds 2 images/)
  })
})
