# Output and Visualization

Controlling output formats and visualizations.

## Output formats

- Choose among dense/sparse/raw.

```erq
data output format dense;;
data output format sparse;;
values [E'Hello, World!\n'] output format raw;;
```

## Vega-Lite visualization

Use `output vega lite with ...` to describe a Vega-Lite spec succinctly. Use `output to 'path' format vega lite png with` to save as an image.

```erq
range(0, 12, 0.05) { x: value, y: sin(value) }
  output vega lite with
    mark line,
    encoding { x: x q, y: y q },
    options { width: 400, height: 300 };;
```

Advanced specs such as facets and color encoding are supported (see `examples/lissajous.erq`, `examples/mandelbrot.erq`).
