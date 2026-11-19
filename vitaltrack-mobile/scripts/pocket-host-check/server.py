# LiteRT 2.1.6 model server for the JVM shim: real CPU (XNNPACK) / GPU (Metal) numerics on the host.
import struct, sys, numpy as np
from ai_edge_litert.compiled_model import CompiledModel
from ai_edge_litert.options import Options, CpuOptions, GpuOptions
from ai_edge_litert.hardware_accelerator import HardwareAccelerator
inp, out = sys.stdin.buffer, sys.stdout.buffer
models = []
def read_exact(n):
    b = bytearray()
    while len(b) < n:
        chunk = inp.read(n - len(b))
        if not chunk: sys.exit(0)
        b += chunk
    return bytes(b)
while True:
    line = inp.readline()
    if not line: break
    cmd = line.decode().split()
    try:
        if cmd[0] == 'C':  # C path accel precision fail_gpu
            path, accel, precision, fail = cmd[1], cmd[2], cmd[3], cmd[4] == '1'
            if accel == 'GPU' and fail: raise RuntimeError('simulated GPU compile failure')
            opts = Options(hardware_accelerators=HardwareAccelerator.GPU, gpu_options=GpuOptions(enforce_f32=precision == 'FP32')) if accel == 'GPU' \
                else Options(hardware_accelerators=HardwareAccelerator.CPU, cpu_options=CpuOptions(num_threads=int(cmd[5])))
            m = CompiledModel.from_file(path, options=opts)
            ins = [m.get_input_buffer_requirements(i, 0)['buffer_size'] // 4 for i in range(len(m.get_signature_by_index(0)['inputs']))]
            outs = [m.get_output_buffer_requirements(i, 0)['buffer_size'] // 4 for i in range(len(m.get_signature_by_index(0)['outputs']))]
            models.append((m, m.create_input_buffers(0), m.create_output_buffers(0), outs))
            out.write(f"OK {len(models)-1} {','.join(map(str, ins))} {','.join(map(str, outs))}\n".encode())
        elif cmd[0] == 'R':  # R handle, then per input: int32 count + float32 data
            m, ib, ob, outs = models[int(cmd[1])]
            for b in ib:
                n = struct.unpack('<i', read_exact(4))[0]
                b.write(np.frombuffer(read_exact(4 * n), '<f4'))
            m.run_by_index(0, ib, ob)
            out.write(b"OK\n")
            for b, n in zip(ob, outs):
                data = b.read(n, np.float32).astype('<f4').tobytes()
                out.write(struct.pack('<i', n)); out.write(data)
        out.flush()
    except Exception as e:
        out.write(f"ERR {type(e).__name__}: {e}\n".replace('\n', ' ').encode() + b"\n"); out.flush()
