# Just Storyboards

Pick stick-figure characters (girl, boy, kid), a camera angle and a location. Just Storyboards shoots the frame in 3D and you download it as a PNG.

- **Characters:** girl, boy, kid. Pick any mix. Your first pick is the main character for Over the shoulder, POV and Extreme close-up.
- **Camera angles:** wide, full, mid, close-up, extreme close-up, over the shoulder, POV, low angle, high angle, Dutch angle. These are real perspective camera moves in a Three.js scene, not 2D tricks.
- **Locations:** café, house, outdoor, street, classroom, inside a car.
- **Pose and expression:** standing, sitting, walking; neutral, happy, sad, surprised, angry.
- **Frame shape:** 16:9, 2.39:1, 4:3, 1:1, 9:16.
- **Board:** add shots, reorder, duplicate, edit, add action and dialogue notes. Download one shot or the whole board (paper or dark sheet) as a PNG.

Everything runs in the browser. Nothing is uploaded. The board is kept in `localStorage`.

## Run it

It is a static site with no build step.

```bash
python3 -m http.server 8000   # or: npx serve
# open http://localhost:8000
```

## Structure

```
index.html        page
styles.css        Netflix-style theme
engine3d.js       characters, locations, cameras (Three.js)
app.js            UI, board, PNG export
three-bundle.js   Three.js bundled with its line helpers (MIT, see three-LICENSE.txt)
```

Built by [Vamshi Creates](https://vamshicreates.tech).
