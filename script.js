        const search =
            document.getElementById("search");

        const apps = [
            ...document.querySelectorAll(".app")
        ];

        const categories =
            document.querySelectorAll(".category");

        const empty =
            document.getElementById("empty");


        let currentCategory = "All";


        /* =========================
           FILTER APPS
        ========================== */

        function filterApps() {

            const query =
                search.value
                    .toLowerCase()
                    .trim();

            let visible = 0;


            apps.forEach(app => {

                const name =
                    app.dataset.name
                        .toLowerCase();

                const category =
                    app.dataset.category;


                const matchesSearch =
                    name.includes(query);


                const matchesCategory =
                    currentCategory === "All" ||
                    category === currentCategory;


                if (
                    matchesSearch &&
                    matchesCategory
                ) {

                    app.style.display = "flex";

                    visible++;

                } else {

                    app.style.display = "none";

                }

            });


            empty.style.display =
                visible === 0
                    ? "block"
                    : "none";
        }


        search.addEventListener(
            "input",
            filterApps
        );


        /* =========================
           CATEGORIES
        ========================== */

        categories.forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    categories.forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );


                    button.classList.add(
                        "active"
                    );


                    currentCategory =
                        button.dataset.category;


                    filterApps();

                }
            );

        });


        /* =========================
           FAVORITES
        ========================== */

        function toggleFavorite(
            event,
            button
        ) {

            event.preventDefault();
            event.stopPropagation();


            button.classList.toggle(
                "active"
            );


            button.textContent =
                button.classList.contains("active")
                    ? "★"
                    : "☆";


            saveFavorites();
        }


        document
            .querySelectorAll(".favorite")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    event =>
                        toggleFavorite(
                            event,
                            button
                        )
                );

            });


        /* =========================
           SAVE FAVORITES
        ========================== */

        function saveFavorites() {

            const favorites = {};


            apps.forEach(app => {

                const name =
                    app.dataset.name;

                const button =
                    app.querySelector(
                        ".favorite"
                    );


                favorites[name] =
                    button.classList.contains(
                        "active"
                    );

            });


            localStorage.setItem(
                "hac-favorites",
                JSON.stringify(
                    favorites
                )
            );

        }


        /* =========================
           LOAD FAVORITES
        ========================== */

        function loadFavorites() {

            const saved =
                JSON.parse(
                    localStorage.getItem(
                        "hac-favorites"
                    )
                );


            if (!saved) return;


            apps.forEach(app => {

                const name =
                    app.dataset.name;

                const button =
                    app.querySelector(
                        ".favorite"
                    );


                if (saved[name]) {

                    button.classList.add(
                        "active"
                    );

                    button.textContent =
                        "★";

                }

            });

        }


        /* =========================
           KEYBOARD SHORTCUT
        ========================== */

        document.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "/" &&
                    document.activeElement !== search
                ) {

                    event.preventDefault();

                    search.focus();

                }


                if (
                    event.key === "Escape"
                ) {

                    search.value = "";

                    search.blur();

                    filterApps();

                }

            }
        );


        /* =========================
           SETTINGS
        ========================== */

        document
            .getElementById(
                "settingsButton"
            )
            .addEventListener(
                "click",
                () => {

                    alert(
                        "HAC Settings will be added here."
                    );

                }
            );


        /* =========================
           START
        ========================== */

        loadFavorites();

        filterApps();
