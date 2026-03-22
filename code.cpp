#include <SFML/Graphics.hpp>
#include <SFML/Window.hpp>
#include <iostream>
#include <vector>
#include <string>
#include <limits>
#include <random>
#include <chrono>
#include <sstream>
#include <algorithm>

using namespace std;
using namespace sf;


const int   WIN_W           = 1000;
const int   WIN_H           = 700;
const int   PANEL_W         = 220;
const float NODE_R          = 26.f;
const int   WEIGHT_INTERVAL = 10;


const Color BG_COLOR    (245, 244, 240);
const Color EDGE_COLOR  (180, 178, 168);
const Color NODE_FILL   (238, 237, 254);
const Color NODE_BORDER ( 83,  74, 183);
const Color NODE_TEXT_C ( 38,  33,  92);
const Color PATH_COLOR  (239, 159,  39);
const Color PATH_LIGHT  (254, 249, 195);
const Color PATH_DARK   (133,  79,  11);
const Color PANEL_BG    (255, 255, 255);
const Color PANEL_BORDER(200, 198, 190);
const Color BTN_NORMAL  (238, 237, 254);
const Color BTN_HOVER   (207, 203, 246);
const Color BTN_TEXT    ( 83,  74, 183);
const Color LABEL_COLOR (100,  98,  90);

// ─── Graph Data ───────────────────────────────────────────────────────────────
struct Node {
    string label;
    float nx, ny;
};

struct Edge {
    int a, b;
};

const Node NODES[] = {
    {"A", 0.14f, 0.18f},
    {"B", 0.40f, 0.09f},
    {"C", 0.70f, 0.16f},
    {"D", 0.86f, 0.47f},
    {"E", 0.66f, 0.76f},
    {"F", 0.38f, 0.86f},
    {"G", 0.10f, 0.63f},
    {"H", 0.47f, 0.47f},
};
const int NODE_COUNT = 8;

const Edge EDGES[] = {
    {0,1},{1,2},{2,3},{3,4},{4,5},{5,6},{6,0},
    {0,7},{1,7},{2,7},{3,7},{4,7},{5,7},{6,7},
    {1,4},{2,5},{0,3}
};
const int EDGE_COUNT = 17;

// ─── Dijkstra ─────────────────────────────────────────────────────────────────
struct PathResult {
    vector<int> nodes;
    int cost;
    PathResult() : cost(-1) {}
};

PathResult dijkstra(int src, int dst, const vector<int>& weights) {
    const int INF = numeric_limits<int>::max();
    vector<int>  dist(NODE_COUNT, INF);
    vector<int>  prev(NODE_COUNT, -1);
    vector<bool> visited(NODE_COUNT, false);
    dist[src] = 0;

    for (int iter = 0; iter < NODE_COUNT; iter++) {
        int u = -1;
        for (int j = 0; j < NODE_COUNT; j++)
            if (!visited[j] && (u == -1 || dist[j] < dist[u])) u = j;
        if (u == -1 || dist[u] == INF) break;
        visited[u] = true;

        for (int ei = 0; ei < EDGE_COUNT; ei++) {
            int a = EDGES[ei].a, b = EDGES[ei].b;
            int w = weights[ei];
            if (a == u && dist[u] + w < dist[b]) { dist[b] = dist[u] + w; prev[b] = u; }
            if (b == u && dist[u] + w < dist[a]) { dist[a] = dist[u] + w; prev[a] = u; }
        }
    }

    PathResult res;
    if (dist[dst] == INF) return res;
    res.cost = dist[dst];
    for (int at = dst; at != -1; at = prev[at])
        res.nodes.insert(res.nodes.begin(), at);
    return res;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
Vector2f nodePos(int i, float gw, float gh) {
    return Vector2f(NODES[i].nx * gw, NODES[i].ny * gh);
}

bool isEdgeOnPath(int ei, const vector<int>& path) {
    for (int k = 0; k + 1 < (int)path.size(); k++) {
        int a = EDGES[ei].a, b = EDGES[ei].b;
        if ((path[k] == a && path[k+1] == b) || (path[k] == b && path[k+1] == a))
            return true;
    }
    return false;
}

string intToStr(int n) {
    ostringstream ss;
    ss << n;
    return ss.str();
}

// ─── Button ───────────────────────────────────────────────────────────────────
struct Button {
    FloatRect rect;
    string    text;
    bool      hovered;
    Button() : hovered(false) {}

    void draw(RenderTarget& rt, const Font& font) const {
        RectangleShape box(Vector2f(rect.width, rect.height));
        box.setPosition(rect.left, rect.top);
        box.setFillColor(hovered ? BTN_HOVER : BTN_NORMAL);
        box.setOutlineColor(NODE_BORDER);
        box.setOutlineThickness(1.f);
        rt.draw(box);

        Text t(text, font, 14);
        t.setFillColor(BTN_TEXT);
        FloatRect tb = t.getLocalBounds();
        t.setPosition(
            rect.left + (rect.width  - tb.width)  / 2.f - tb.left,
            rect.top  + (rect.height - tb.height) / 2.f - tb.top
        );
        rt.draw(t);
    }

    bool contains(Vector2f p) const { return rect.contains(p); }
};

// ─── Dropdown ─────────────────────────────────────────────────────────────────
struct Dropdown {
    FloatRect rect;
    int  selected;
    bool open;
    Dropdown() : selected(0), open(false) {}

    void draw(RenderTarget& rt, const Font& font) const {
        RectangleShape box(Vector2f(rect.width, rect.height));
        box.setPosition(rect.left, rect.top);
        box.setFillColor(Color::White);
        box.setOutlineColor(PANEL_BORDER);
        box.setOutlineThickness(1.f);
        rt.draw(box);

        Text t(NODES[selected].label, font, 14);
        t.setFillColor(NODE_TEXT_C);
        FloatRect tb = t.getLocalBounds();
        t.setPosition(rect.left + 10, rect.top + (rect.height - tb.height) / 2.f - tb.top);
        rt.draw(t);

        Text arrow("v", font, 11);
        arrow.setFillColor(LABEL_COLOR);
        arrow.setPosition(rect.left + rect.width - 20, rect.top + 9);
        rt.draw(arrow);

        if (open) {
            for (int i = 0; i < NODE_COUNT; i++) {
                FloatRect item(rect.left, rect.top + rect.height + i * 28.f, rect.width, 28.f);
                RectangleShape ib(Vector2f(item.width, item.height));
                ib.setPosition(item.left, item.top);
                ib.setFillColor(i == selected ? BTN_HOVER : Color::White);
                ib.setOutlineColor(PANEL_BORDER);
                ib.setOutlineThickness(0.5f);
                rt.draw(ib);

                Text it(NODES[i].label, font, 13);
                it.setFillColor(NODE_TEXT_C);
                FloatRect itb = it.getLocalBounds();
                it.setPosition(item.left + 10, item.top + (item.height - itb.height) / 2.f - itb.top);
                rt.draw(it);
            }
        }
    }

    bool handleClick(Vector2f p) {
        if (rect.contains(p)) { open = !open; return true; }
        if (open) {
            for (int i = 0; i < NODE_COUNT; i++) {
                FloatRect item(rect.left, rect.top + rect.height + i * 28.f, rect.width, 28.f);
                if (item.contains(p)) { selected = i; open = false; return true; }
            }
            open = false;
        }
        return false;
    }
};

// ─── Run Dijkstra helper ──────────────────────────────────────────────────────
void runDijkstra(int src, int dst, const vector<int>& w,
                 PathResult& result, bool& found) {
    if (src == dst) { result = PathResult(); found = false; return; }
    result = dijkstra(src, dst, w);
    found  = !result.nodes.empty();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
int main() {
    RenderWindow window(
        VideoMode(WIN_W, WIN_H),
        "Dynamic Shortest Path - SFML",
        Style::Close
    );
    window.setFramerateLimit(60);

    Font font;
    if (!font.loadFromFile("C:/Windows/Fonts/arial.ttf") &&
        !font.loadFromFile("C:/Windows/Fonts/calibri.ttf") &&
        !font.loadFromFile("C:/Windows/Fonts/tahoma.ttf") &&
        !font.loadFromFile("arial.ttf")) {
        cerr << "ERROR: Could not load font.\n";
        cerr << "Place arial.ttf next to the .exe and try again.\n";
        return 1;
    }

    // RNG
    mt19937 rng(static_cast<unsigned>(
        chrono::steady_clock::now().time_since_epoch().count()
    ));
    uniform_int_distribution<int> wDist(2, 19);

    vector<int> weights(EDGE_COUNT);
    for (int i = 0; i < EDGE_COUNT; i++) weights[i] = wDist(rng);

    PathResult result;
    bool pathFound = false;

    float gw = WIN_W - PANEL_W;
    float gh = WIN_H;

    // UI elements
    Dropdown ddSrc, ddDst;
    ddSrc.rect     = FloatRect(gw + 14, 80,  PANEL_W - 28.f, 32);
    ddSrc.selected = 0;
    ddDst.rect     = FloatRect(gw + 14, 155, PANEL_W - 28.f, 32);
    ddDst.selected = 4; // E

    Button findBtn;
    findBtn.rect = FloatRect(gw + 14, 210, PANEL_W - 28.f, 36);
    findBtn.text = "Find shortest path";

    auto lastChange    = chrono::steady_clock::now();
    int  countdown     = WEIGHT_INTERVAL;
    bool justChanged   = false;
    auto justChangedAt = chrono::steady_clock::now();

    while (window.isOpen()) {
        // ── Timer ──
        auto now    = chrono::steady_clock::now();
        int elapsed = (int)chrono::duration_cast<chrono::seconds>(now - lastChange).count();
        countdown   = WEIGHT_INTERVAL - elapsed;

        if (countdown <= 0) {
            for (int i = 0; i < EDGE_COUNT; i++) weights[i] = wDist(rng);
            lastChange    = now;
            countdown     = WEIGHT_INTERVAL;
            justChanged   = true;
            justChangedAt = now;
            if (pathFound)
                runDijkstra(ddSrc.selected, ddDst.selected, weights, result, pathFound);
        }
        if (justChanged) {
            auto ms = chrono::duration_cast<chrono::milliseconds>(now - justChangedAt).count();
            if (ms > 2000) justChanged = false;
        }

        // ── Events ──
        Event ev;
        while (window.pollEvent(ev)) {
            if (ev.type == Event::Closed) window.close();

            if (ev.type == Event::MouseMoved) {
                Vector2f mp((float)ev.mouseMove.x, (float)ev.mouseMove.y);
                findBtn.hovered = findBtn.contains(mp);
            }

            if (ev.type == Event::MouseButtonPressed &&
                ev.mouseButton.button == Mouse::Left) {
                Vector2f mp((float)ev.mouseButton.x, (float)ev.mouseButton.y);
                bool handled = ddSrc.handleClick(mp);
                if (!handled) handled = ddDst.handleClick(mp);
                if (!handled && findBtn.contains(mp))
                    runDijkstra(ddSrc.selected, ddDst.selected, weights, result, pathFound);
            }
        }

        // ── Build path highlight sets ──
        vector<bool> edgeOnPath(EDGE_COUNT, false);
        vector<bool> nodeOnPath(NODE_COUNT, false);
        if (pathFound) {
            for (int ei = 0; ei < EDGE_COUNT; ei++)
                edgeOnPath[ei] = isEdgeOnPath(ei, result.nodes);
            for (int i = 0; i < (int)result.nodes.size(); i++)
                nodeOnPath[result.nodes[i]] = true;
        }

        window.clear(BG_COLOR);

        // ── Draw edges ──
        for (int ei = 0; ei < EDGE_COUNT; ei++) {
            Vector2f pa = nodePos(EDGES[ei].a, gw, gh);
            Vector2f pb = nodePos(EDGES[ei].b, gw, gh);
            bool onPath = edgeOnPath[ei];

            if (onPath) {
                for (int t = -2; t <= 2; t++) {
                    Vertex ln1[2] = {
                        Vertex(pa + Vector2f(0, (float)t), PATH_COLOR),
                        Vertex(pb + Vector2f(0, (float)t), PATH_COLOR)
                    };
                    Vertex ln2[2] = {
                        Vertex(pa + Vector2f((float)t, 0), PATH_COLOR),
                        Vertex(pb + Vector2f((float)t, 0), PATH_COLOR)
                    };
                    window.draw(ln1, 2, Lines);
                    window.draw(ln2, 2, Lines);
                }
            } else {
                Vertex line[2] = {
                    Vertex(pa, EDGE_COLOR),
                    Vertex(pb, EDGE_COLOR)
                };
                window.draw(line, 2, Lines);
            }

            // Weight label
            Vector2f mid((pa.x + pb.x) / 2.f, (pa.y + pb.y) / 2.f);
            string wStr = intToStr(weights[ei]);
            Text wLabel(wStr, font, 12);
            FloatRect wb = wLabel.getLocalBounds();
            RectangleShape wBg(Vector2f(wb.width + 10, 18));
            wBg.setPosition(mid.x - wb.width / 2.f - 5, mid.y - 9);
            wBg.setFillColor(onPath ? PATH_LIGHT : BG_COLOR);
            window.draw(wBg);
            wLabel.setFillColor(onPath ? PATH_DARK : LABEL_COLOR);
            wLabel.setPosition(mid.x - wb.width / 2.f - wb.left,
                               mid.y - wb.height / 2.f - wb.top);
            window.draw(wLabel);
        }

        // ── Draw nodes ──
        for (int i = 0; i < NODE_COUNT; i++) {
            Vector2f p = nodePos(i, gw, gh);
            bool onPath = nodeOnPath[i];

            CircleShape circle(NODE_R);
            circle.setOrigin(NODE_R, NODE_R);
            circle.setPosition(p);
            circle.setFillColor(onPath ? PATH_COLOR : NODE_FILL);
            circle.setOutlineColor(onPath ? Color(186, 117, 23) : NODE_BORDER);
            circle.setOutlineThickness(onPath ? 2.5f : 1.5f);
            window.draw(circle);

            Text label(NODES[i].label, font, 15);
            label.setStyle(Text::Bold);
            label.setFillColor(onPath ? PATH_LIGHT : NODE_TEXT_C);
            FloatRect lb = label.getLocalBounds();
            label.setPosition(p.x - lb.width / 2.f - lb.left,
                              p.y - lb.height / 2.f - lb.top);
            window.draw(label);
        }

        // ── Panel ──
        RectangleShape panel(Vector2f((float)PANEL_W, (float)WIN_H));
        panel.setPosition(gw, 0);
        panel.setFillColor(PANEL_BG);
        panel.setOutlineColor(PANEL_BORDER);
        panel.setOutlineThickness(1.f);
        window.draw(panel);

        // Title
        Text title("Shortest Path", font, 16);
        title.setStyle(Text::Bold);
        title.setFillColor(NODE_TEXT_C);
        title.setPosition(gw + 14, 20);
        window.draw(title);

        Text sub("Dynamic weighted graph", font, 11);
        sub.setFillColor(LABEL_COLOR);
        sub.setPosition(gw + 14, 44);
        window.draw(sub);

        // Separator
        RectangleShape sep(Vector2f(PANEL_W - 28.f, 1));
        sep.setPosition(gw + 14, 64);
        sep.setFillColor(PANEL_BORDER);
        window.draw(sep);

        // From / To
        Text fromLbl("From", font, 12);
        fromLbl.setFillColor(LABEL_COLOR);
        fromLbl.setPosition(gw + 14, 68);
        window.draw(fromLbl);
        ddSrc.draw(window, font);

        Text toLbl("To", font, 12);
        toLbl.setFillColor(LABEL_COLOR);
        toLbl.setPosition(gw + 14, 143);
        window.draw(toLbl);
        ddDst.draw(window, font);

        findBtn.draw(window, font);

        RectangleShape sep2(Vector2f(PANEL_W - 28.f, 1));
        sep2.setPosition(gw + 14, 264);
        sep2.setFillColor(PANEL_BORDER);
        window.draw(sep2);

        // ── Result ──
        float resultY = 274;
        if (pathFound) {
            Text pathLbl("Path", font, 12);
            pathLbl.setFillColor(LABEL_COLOR);
            pathLbl.setPosition(gw + 14, resultY);
            window.draw(pathLbl);
            resultY += 18;

            // Draw path with word wrap
            string line;
            for (int k = 0; k < (int)result.nodes.size(); k++) {
                string token = NODES[result.nodes[k]].label;
                if (k + 1 < (int)result.nodes.size()) token += " > ";
                Text tmp(line + token, font, 13);
                if (tmp.getLocalBounds().width > PANEL_W - 30 && !line.empty()) {
                    Text drawn(line, font, 13);
                    drawn.setFillColor(NODE_TEXT_C);
                    drawn.setPosition(gw + 14, resultY);
                    window.draw(drawn);
                    resultY += 18;
                    line = token;
                } else {
                    line += token;
                }
            }
            if (!line.empty()) {
                Text drawn(line, font, 13);
                drawn.setFillColor(NODE_TEXT_C);
                drawn.setPosition(gw + 14, resultY);
                window.draw(drawn);
                resultY += 22;
            }

            // Cost badge
            Text costLbl("Total cost", font, 12);
            costLbl.setFillColor(LABEL_COLOR);
            costLbl.setPosition(gw + 14, resultY);
            window.draw(costLbl);
            resultY += 20;

            Text costVal(intToStr(result.cost), font, 14);
            costVal.setStyle(Text::Bold);
            FloatRect cvb = costVal.getLocalBounds();
            RectangleShape costBg(Vector2f(cvb.width + 16, 24));
            costBg.setPosition(gw + 14, resultY);
            costBg.setFillColor(PATH_LIGHT);
            costBg.setOutlineColor(Color(250, 199, 117));
            costBg.setOutlineThickness(1.f);
            window.draw(costBg);
            costVal.setFillColor(PATH_DARK);
            costVal.setPosition(gw + 22 - cvb.left, resultY + 4 - cvb.top);
            window.draw(costVal);

        } else {
            Text noPath("Select nodes and\nclick Find Path.", font, 13);
            noPath.setFillColor(LABEL_COLOR);
            noPath.setPosition(gw + 14, resultY);
            window.draw(noPath);
        }

        // ── Timer ──
        RectangleShape sep3(Vector2f(PANEL_W - 28.f, 1));
        sep3.setPosition(gw + 14, WIN_H - 120);
        sep3.setFillColor(PANEL_BORDER);
        window.draw(sep3);

        Text timerTitle("Weight update", font, 12);
        timerTitle.setFillColor(LABEL_COLOR);
        timerTitle.setPosition(gw + 14, WIN_H - 110);
        window.draw(timerTitle);

        string timerStr;
        Color  timerColor;
        if (justChanged) {
            timerStr   = "Weights changed!";
            timerColor = Color(15, 110, 86);
        } else {
            timerStr   = "Next change in " + intToStr(max(0, countdown)) + "s";
            timerColor = (countdown <= 3) ? Color(163, 45, 45) : NODE_BORDER;
        }
        Text timerText(timerStr, font, 13);
        timerText.setFillColor(timerColor);
        timerText.setPosition(gw + 14, WIN_H - 92);
        window.draw(timerText);

        // Progress bar
        float barW = PANEL_W - 28.f;
        RectangleShape barBg(Vector2f(barW, 8));
        barBg.setPosition(gw + 14, WIN_H - 68);
        barBg.setFillColor(Color(220, 218, 210));
        window.draw(barBg);

        float pct = max(0.f, min(1.f, (float)countdown / WEIGHT_INTERVAL));
        RectangleShape barFill(Vector2f(barW * pct, 8));
        barFill.setPosition(gw + 14, WIN_H - 68);
        barFill.setFillColor((countdown <= 3) ? Color(163, 45, 45) : NODE_BORDER);
        window.draw(barFill);

        // Legend
        RectangleShape sep4(Vector2f(PANEL_W - 28.f, 1));
        sep4.setPosition(gw + 14, WIN_H - 50);
        sep4.setFillColor(PANEL_BORDER);
        window.draw(sep4);

        CircleShape legendDot(7.f);
        legendDot.setFillColor(PATH_COLOR);
        legendDot.setPosition(gw + 14, WIN_H - 36);
        window.draw(legendDot);
        Text legendText("= shortest path", font, 11);
        legendText.setFillColor(LABEL_COLOR);
        legendText.setPosition(gw + 28, WIN_H - 35);
        window.draw(legendText);

        window.display();
    }

    return 0;
}