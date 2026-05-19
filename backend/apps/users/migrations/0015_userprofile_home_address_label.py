from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0014_homeaddresschangerequest_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="home_address_label",
            field=models.CharField(
                blank=True,
                help_text=(
                    "Adresse résolue (rue, code postal, ville). Utilisée pour "
                    "l'affichage à l'utilisateur — les coords brutes ne sont jamais "
                    "exposées dans l'UI."
                ),
                max_length=300,
            ),
        ),
    ]
