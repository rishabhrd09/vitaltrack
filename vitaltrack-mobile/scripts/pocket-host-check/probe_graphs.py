# Peak memory and time of each pinned Pocket TTS graph on CPU and GPU, one graph per process,
# plus the total size of every intermediate op output. Host evidence only (LiteRT 2.1.6, macOS).
# Usage: python probe_graphs.py /path/to/verified/alba/assets
import json, resource, subprocess, sys, time
GRAPHS = ['pt_flowlm_fused_fp16', 'pt_mimi_dec_tx_fp16', 'pt_mimi_deconly_fp16']

def child(assets, name, accel, threads):
    import numpy as np
    from ai_edge_litert.compiled_model import CompiledModel
    from ai_edge_litert.options import Options, CpuOptions, GpuOptions
    from ai_edge_litert.hardware_accelerator import HardwareAccelerator
    opts = Options(hardware_accelerators=HardwareAccelerator.GPU, gpu_options=GpuOptions()) if accel == 'gpu' else \
        Options(hardware_accelerators=HardwareAccelerator.CPU, cpu_options=CpuOptions(num_threads=threads))
    t = time.monotonic(); m = CompiledModel.from_file(f'{assets}/{name}.tflite', options=opts); create = time.monotonic() - t
    ins, outs = m.create_input_buffers(0), m.create_output_buffers(0)
    for i, b in enumerate(ins): b.write(np.random.default_rng(1).standard_normal(m.get_input_buffer_requirements(i, 0)['buffer_size'] // 4).astype(np.float32) * 0.1)
    runs = []
    for _ in range(3):
        t = time.monotonic(); m.run_by_index(0, ins, outs); runs.append(time.monotonic() - t)
    print(json.dumps({'graph': name, 'accelerator': accel, 'threads': threads, 'create_s': round(create, 2), 'first_run_ms': round(runs[0] * 1000, 1),
                      'next_run_ms': round(min(runs[1:]) * 1000, 1), 'peak_rss_mb': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576)}))

def op_output_total_gb(assets, name):
    import numpy as np
    from ai_edge_litert import schema_py_generated as S
    m = S.Model.GetRootAsModel(open(f'{assets}/{name}.tflite', 'rb').read(), 0); g = m.Subgraphs(0); total = 0
    for i in range(g.OperatorsLength()):
        op = g.Operators(i)
        for j in range(op.OutputsLength()):
            t = g.Tensors(op.Outputs(j))
            total += int(np.prod([max(1, t.Shape(k)) for k in range(t.ShapeLength())])) * (2 if t.Type() == 1 else 4)
    return round(total / 2**30, 2)

if __name__ == '__main__':
    if len(sys.argv) == 5:
        child(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])); sys.exit()
    assets = sys.argv[1]
    for name in GRAPHS:
        print(json.dumps({'graph': name, 'sum_of_op_outputs_gb': op_output_total_gb(assets, name)}))
        for accel in ('cpu', 'gpu'):
            out = subprocess.run([sys.executable, __file__, assets, name, accel, '4'], capture_output=True, text=True)
            print(out.stdout.strip() or f'{{"graph": "{name}", "accelerator": "{accel}", "error": {json.dumps(out.stderr.strip()[-300:])}}}')
